from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from contextlib import ExitStack
import json
import os
import subprocess
import sys
import time
from dataclasses import asdict, dataclass
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any, Callable, Literal, TextIO, TypeVar, cast
from urllib.parse import urlparse

from dotenv import load_dotenv

from ingest.garmin.health_download import GarminHealthDownloadResult
from ingest.garmin.paths import get_project_root
from scripts import download_garmin_fit, download_garmin_health
from scripts.pipeline_state import (
    RefreshLock,
    RefreshLockHeldError,
    RunManifest,
    get_state_dir,
    load_latest_manifest,
    load_manifest,
    write_manifest,
)

RAW_FAILURE_EXIT_CODE = 3
BRONZE_FAILURE_EXIT_CODE = 4
DBT_FAILURE_EXIT_CODE = 5
PUBLISH_FAILURE_EXIT_CODE = 6
LOCK_FAILURE_EXIT_CODE = 7
MANIFEST_FAILURE_EXIT_CODE = 8
GEOCODE_FAILURE_EXIT_CODE = 9
USAGE_FAILURE_EXIT_CODE = 2

CommandRunner = Callable[[list[str], Path, str, bool], subprocess.CompletedProcess[str]]
BundleSummaryRunner = Callable[[list[str], Path], subprocess.CompletedProcess[str]]
COMMAND_PROGRESS_INTERVAL_SECONDS = 30
T = TypeVar("T")
RefreshSource = Literal["fit", "health"]


@dataclass(frozen=True)
class RefreshOptions:
    source: RefreshSource
    tokenstore: str
    fit_limit: int
    no_input: bool
    no_publish: bool
    dry_run: bool
    json_output: bool
    databricks_target: str


class PipelineError(RuntimeError):
    def __init__(self, message: str, exit_code: int, manifest: RunManifest | None = None) -> None:
        super().__init__(message)
        self.exit_code = exit_code
        self.manifest = manifest


def progress_output(json_output: bool) -> TextIO:
    return sys.stderr if json_output else sys.stdout


def report_progress(stage: str, message: str, *, json_output: bool) -> None:
    timestamp = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S UTC")
    print(f"{timestamp} [{stage}] {message}", file=progress_output(json_output), flush=True)


def default_command_runner(
    argv: list[str],
    cwd: Path,
    stage: str,
    json_output: bool,
) -> subprocess.CompletedProcess[str]:
    output = progress_output(json_output) if json_output else None
    process = subprocess.Popen(argv, cwd=cwd, stdout=output, stderr=output)
    started_at = time.monotonic()

    while True:
        try:
            returncode = process.wait(timeout=COMMAND_PROGRESS_INTERVAL_SECONDS)
            return subprocess.CompletedProcess(argv, returncode)
        except subprocess.TimeoutExpired:
            elapsed_seconds = int(time.monotonic() - started_at)
            report_progress(
                stage,
                f"still running after {elapsed_seconds}s: {' '.join(argv)}",
                json_output=json_output,
            )


def default_bundle_summary_runner(
    argv: list[str], cwd: Path
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(argv, cwd=cwd, check=False, capture_output=True, text=True)


def run_with_heartbeat(
    stage: str,
    operation: Callable[[], T],
    *,
    json_output: bool,
) -> T:
    started_at = time.monotonic()
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(operation)

        while True:
            try:
                return future.result(timeout=COMMAND_PROGRESS_INTERVAL_SECONDS)
            except TimeoutError:
                elapsed_seconds = int(time.monotonic() - started_at)
                report_progress(
                    stage,
                    f"still running after {elapsed_seconds}s",
                    json_output=json_output,
                )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="running-signals",
        description="Run the Running Signals data refresh pipeline.",
    )
    commands = parser.add_subparsers(dest="command", required=True)

    preflight = commands.add_parser("preflight", help="Validate a command's local configuration.")
    preflight.add_argument("stage", choices=["raw", "bronze", "dbt", "geocode", "publish", "refresh"])
    preflight.add_argument("source", choices=["fit", "health", "all"], nargs="?")
    preflight.add_argument("--tokenstore", default=default_tokenstore())
    preflight.add_argument("--no-input", action="store_true")
    preflight.add_argument("--json", action="store_true", dest="json_output")

    refresh = commands.add_parser("refresh", help="Run a complete source refresh.")
    refresh.add_argument("source", choices=["fit", "health"])
    refresh.add_argument("--mode", choices=["incremental", "full"], default="incremental")
    refresh.add_argument("--confirm", action="store_true")
    add_refresh_arguments(refresh)

    raw = commands.add_parser("raw", help="Land one source in S3 without derived stages.")
    raw_commands = raw.add_subparsers(dest="source", required=True)
    add_raw_arguments(raw_commands.add_parser("fit", help="Land Garmin FIT files in S3."), "fit")
    add_raw_arguments(raw_commands.add_parser("health", help="Land Garmin health payloads in S3."), "health")

    bronze = commands.add_parser("bronze", help="Run one or both bronze jobs.")
    bronze.add_argument("source", choices=["fit", "health", "all"])
    bronze.add_argument("--mode", choices=["incremental", "full"], default="incremental")
    bronze.add_argument("--confirm", action="store_true")
    bronze.add_argument("--dry-run", action="store_true")
    bronze.add_argument("--databricks-target", default="dev")
    bronze.add_argument("--json", action="store_true", dest="json_output")

    dbt = commands.add_parser("dbt", help="Build and test source-specific or complete dbt models.")
    dbt.add_argument("source", choices=["fit", "health", "all"])
    dbt.add_argument("--dry-run", action="store_true")
    dbt.add_argument("--json", action="store_true", dest="json_output")

    geocode = commands.add_parser("geocode", help="Resolve route city names from representative GPS points.")
    geocode.add_argument("--dry-run", action="store_true")
    geocode.add_argument("--json", action="store_true", dest="json_output")

    publish = commands.add_parser("publish", help="Sync Supabase serving tables from gold data.")
    publish.add_argument("--mode", choices=["incremental", "full"], default="incremental")
    publish.add_argument("--confirm", action="store_true")
    publish.add_argument("--supabase-db-url")
    publish.add_argument("--dry-run", action="store_true")
    publish.add_argument("--no-progress", action="store_true")
    publish.add_argument("--json", action="store_true", dest="json_output")

    status = commands.add_parser("status", help="Print a stored run manifest.")
    status_group = status.add_mutually_exclusive_group(required=True)
    status_group.add_argument("run_id", nargs="?")
    status_group.add_argument("--latest", action="store_true")
    status.add_argument("--json", action="store_true", dest="json_output")

    return parser


def default_tokenstore() -> str:
    return os.getenv("GARMIN_TOKENSTORE", "~/.garminconnect")


def add_refresh_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--tokenstore", default=default_tokenstore())
    parser.add_argument("--fit-limit", type=download_garmin_fit.parse_limit, default=200)
    parser.add_argument("--no-input", action="store_true")
    parser.add_argument("--no-publish", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true", dest="json_output")
    parser.add_argument("--databricks-target", default="dev")


def add_raw_arguments(parser: argparse.ArgumentParser, source: RefreshSource) -> None:
    parser.add_argument("--tokenstore", default=default_tokenstore())
    parser.add_argument("--s3-bucket")
    parser.add_argument("--s3-prefix")
    parser.add_argument("--mode", choices=["incremental", "range-overwrite"], default="incremental")
    parser.add_argument("--start-date", type=download_garmin_fit.parse_date_arg)
    parser.add_argument("--end-date", type=download_garmin_fit.parse_date_arg)
    if source == "fit":
        parser.add_argument("--fit-limit", type=download_garmin_fit.parse_limit, default=200)
    parser.add_argument("--no-input", action="store_true")
    parser.add_argument("--confirm", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true", dest="json_output")


def refresh_options(args: argparse.Namespace) -> RefreshOptions:
    return RefreshOptions(
        source=cast(RefreshSource, args.source),
        tokenstore=args.tokenstore,
        fit_limit=args.fit_limit,
        no_input=args.no_input,
        no_publish=args.no_publish,
        dry_run=args.dry_run,
        json_output=args.json_output,
        databricks_target=args.databricks_target,
    )


def preflight_errors(
    project_root: Path,
    tokenstore: str,
    source: RefreshSource = "fit",
    *,
    no_input: bool,
    stages: frozenset[str] | None = None,
    raw_s3_bucket: str | None = None,
) -> list[str]:
    load_dotenv(project_root / ".env")
    missing: list[str] = []
    required_stages = stages or (
        frozenset({"raw", "bronze", "dbt", "geocode", "publish"})
        if source == "fit"
        else frozenset({"raw", "bronze", "dbt"})
    )
    requires_raw = "raw" in required_stages
    requires_databricks = bool(required_stages & {"bronze", "dbt", "geocode", "publish"})

    if requires_raw and source == "fit" and not (raw_s3_bucket or os.getenv("GARMIN_FIT_S3_BUCKET")):
        missing.append("GARMIN_FIT_S3_BUCKET")

    if requires_raw and source == "health" and not (
        raw_s3_bucket or os.getenv("GARMIN_HEALTH_S3_BUCKET") or os.getenv("GARMIN_FIT_S3_BUCKET")
    ):
        missing.append("GARMIN_HEALTH_S3_BUCKET or GARMIN_FIT_S3_BUCKET")

    if requires_databricks:
        for name in (
            "DATABRICKS_HOST",
            "DATABRICKS_TOKEN",
            "DATABRICKS_CATALOG",
            "DATABRICKS_GOLD_SCHEMA",
        ):
            if not os.getenv(name):
                missing.append(name)

    if "publish" in required_stages and not os.getenv("SUPABASE_DB_URL"):
        missing.append("SUPABASE_DB_URL")

    if requires_databricks:
        http_path = os.getenv("DATABRICKS_HTTP_PATH")
        if not http_path:
            missing.append("DATABRICKS_HTTP_PATH")
        elif not is_sql_warehouse_http_path(http_path):
            missing.append("a Databricks SQL warehouse DATABRICKS_HTTP_PATH")

    supabase_db_url = os.getenv("SUPABASE_DB_URL") if "publish" in required_stages else None
    if supabase_db_url and not is_postgres_connection_url(supabase_db_url):
        missing.append("a PostgreSQL SUPABASE_DB_URL")

    if "dbt" in required_stages and not dbt_profile_path().is_file():
        missing.append(f"dbt profile at {dbt_profile_path()}")

    if requires_raw:
        tokenstore_exists = Path(tokenstore).expanduser().exists()
        has_garmin_credentials = bool(os.getenv("GARMIN_EMAIL")) and bool(os.getenv("GARMIN_PASSWORD"))
        if no_input and not tokenstore_exists and not has_garmin_credentials:
            missing.append("a Garmin token store or GARMIN_EMAIL and GARMIN_PASSWORD")

    return missing


def is_sql_warehouse_http_path(value: str) -> bool:
    marker = "/sql/1.0/warehouses/"
    return marker in value and bool(value.rsplit(marker, maxsplit=1)[1].strip("/"))


def is_postgres_connection_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme in {"postgres", "postgresql"} and parsed.hostname is not None


def dbt_profile_path() -> Path:
    profiles_dir = os.getenv("DBT_PROFILES_DIR")
    return (Path(profiles_dir).expanduser() if profiles_dir else Path.home() / ".dbt") / "profiles.yml"


def run_preflight(
    project_root: Path,
    tokenstore: str,
    source: RefreshSource = "fit",
    *,
    no_input: bool,
    stages: frozenset[str] | None = None,
    raw_s3_bucket: str | None = None,
) -> list[str]:
    required_stages = stages or (
        frozenset({"raw", "bronze", "dbt", "geocode", "publish"})
        if source == "fit"
        else frozenset({"raw", "bronze", "dbt"})
    )
    errors = preflight_errors(
        project_root,
        tokenstore,
        source,
        no_input=no_input,
        stages=required_stages,
        raw_s3_bucket=raw_s3_bucket,
    )
    if errors:
        raise PipelineError(
            "Missing refresh configuration: " + ", ".join(errors),
            USAGE_FAILURE_EXIT_CODE,
        )

    checks: list[str] = []
    if "raw" in required_stages:
        checks.extend(
            [
                f"Garmin {source} raw S3 configuration",
                "Non-interactive Garmin credentials" if no_input else "Garmin credentials or prompt",
            ]
        )
    if required_stages & {"bronze", "dbt", "geocode", "publish"}:
        checks.append("Databricks SQL configuration values")
    if "dbt" in required_stages:
        checks.append(f"dbt profile at {dbt_profile_path()}")
    if "publish" in required_stages:
        checks.append("Hosted Supabase connection URL")
    return checks


def ensure_bundle_job_deployed(
    project_root: Path,
    source: RefreshSource,
    target: str,
    runner: BundleSummaryRunner | None = None,
) -> str:
    job_key = f"garmin_{source}_bronze_ingestion"
    argv = [
        "databricks",
        "bundle",
        "summary",
        "--target",
        target,
        "--output",
        "json",
    ]

    try:
        result = (runner or default_bundle_summary_runner)(argv, project_root / "databricks")
    except OSError as exc:
        raise PipelineError(
            f"Could not inspect Databricks bundle target {target}: {exc}",
            USAGE_FAILURE_EXIT_CODE,
        ) from exc

    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "unknown error").strip()
        raise PipelineError(
            f"Could not inspect Databricks bundle target {target}: {detail}",
            USAGE_FAILURE_EXIT_CODE,
        )

    try:
        summary = json.loads(result.stdout)
        job = summary["resources"]["jobs"][job_key]
    except (json.JSONDecodeError, KeyError, TypeError) as exc:
        raise PipelineError(
            f"Databricks bundle summary did not contain the {source} bronze job for target {target}.",
            USAGE_FAILURE_EXIT_CODE,
        ) from exc

    if not isinstance(job, dict) or not job.get("id"):
        raise PipelineError(
            f"Databricks {source.upper()} bronze job is not deployed for target {target}. "
            f"Run: cd databricks && databricks bundle deploy --target {target}",
            USAGE_FAILURE_EXIT_CODE,
        )

    return f"Databricks {source} bronze job deployed for target {target} (job {job['id']})"


def fit_result_details(result: Any) -> dict[str, Any]:
    return {
        "inspected_activity_count": result.inspected_activity_count,
        "downloaded_count": len(result.downloaded_paths),
        "skipped_existing_count": len(result.skipped_existing_paths),
    }


def health_result_details(result: GarminHealthDownloadResult) -> dict[str, Any]:
    return {
        "inspected_day_count": result.inspected_day_count,
        "written_count": len(result.written_paths),
        "skipped_existing_count": len(result.skipped_existing_paths),
        "endpoint_failures": [
            {
                "calendar_date": failure.calendar_date.isoformat(),
                "payload_type": failure.payload_type,
                "source_method": failure.source_method,
                "error_type": failure.error_type,
                "error_message": failure.error_message,
            }
            for failure in result.endpoint_failures
        ],
    }


def raw_landing_failure_message(source: str, exc: Exception) -> str:
    error_text = str(exc)
    if "error when retrieving token from sso" in error_text.lower() and "expired" in error_text.lower():
        profile = (
            os.getenv("AWS_PROFILE")
            or os.getenv("AWS_DEFAULT_PROFILE")
            or "running-signals-dev"
        )
        return (
            f"{source} raw landing failed: AWS SSO session expired. "
            f"Run: aws sso login --profile {profile}"
        )

    return f"{source} raw landing failed: {error_text}"


def start_stage(manifest: RunManifest, state_dir: Path, name: str, details: dict[str, Any]) -> None:
    manifest.start_stage(name, details)
    write_manifest(state_dir, manifest)


def complete_stage(
    manifest: RunManifest,
    state_dir: Path,
    name: str,
    details: dict[str, Any],
) -> None:
    manifest.finish_stage(name, "succeeded", details=details)
    write_manifest(state_dir, manifest)


def fail_stage(
    manifest: RunManifest,
    state_dir: Path,
    name: str,
    details: dict[str, Any],
    message: str,
    exit_code: int,
) -> None:
    manifest.finish_stage(name, "failed", details=details, error=message)
    manifest.finish("failed")
    write_manifest(state_dir, manifest)
    raise PipelineError(message, exit_code, manifest)


def run_command_stage(
    manifest: RunManifest,
    state_dir: Path,
    name: str,
    argv: list[str],
    cwd: Path,
    exit_code: int,
    command_runner: CommandRunner,
    *,
    json_output: bool,
) -> None:
    details: dict[str, Any] = {"argv": argv, "cwd": str(cwd)}
    start_stage(manifest, state_dir, name, details)
    report_progress(name, f"starting: {' '.join(argv)}", json_output=json_output)

    try:
        result = command_runner(argv, cwd, name, json_output)
    except OSError as exc:
        fail_stage(
            manifest,
            state_dir,
            name,
            details,
            f"{name} could not start: {exc}",
            exit_code,
        )
        return

    details["exit_code"] = result.returncode
    if not json_output:
        if result.stdout:
            print(result.stdout, end="" if result.stdout.endswith("\n") else "\n")
        if result.stderr:
            print(result.stderr, end="" if result.stderr.endswith("\n") else "\n", file=sys.stderr)

    if result.returncode != 0:
        fail_stage(
            manifest,
            state_dir,
            name,
            details,
            f"{name} command exited with status {result.returncode}.",
            exit_code,
        )
        return

    complete_stage(manifest, state_dir, name, details)
    report_progress(name, "completed successfully", json_output=json_output)


def databricks_command(job_name: str, target: str, *, full_refresh: bool) -> list[str]:
    argv = ["databricks", "bundle", "run", "--target", target]
    if full_refresh:
        argv.extend(["--params", "full_refresh=true"])
    argv.append(job_name)
    return argv


def run_bronze_jobs(
    manifest: RunManifest,
    state_dir: Path,
    project_root: Path,
    source: str,
    target: str,
    full_refresh: bool,
    command_runner: CommandRunner,
    *,
    json_output: bool,
) -> None:
    jobs = {
        "fit": "garmin_fit_bronze_ingestion",
        "health": "garmin_health_bronze_ingestion",
    }
    selected_sources = ("fit", "health") if source == "all" else (source,)

    for selected_source in selected_sources:
        job_name = jobs[selected_source]
        run_command_stage(
            manifest,
            state_dir,
            f"bronze_{selected_source}",
            databricks_command(job_name, target, full_refresh=full_refresh),
            project_root / "databricks",
            BRONZE_FAILURE_EXIT_CODE,
            command_runner,
            json_output=json_output,
        )


def run_fit_raw_stage(
    manifest: RunManifest,
    state_dir: Path,
    options: RefreshOptions,
    fit_runner: Callable[..., Any],
) -> None:
    start_stage(manifest, state_dir, "fit_raw", {})
    report_progress("fit_raw", "starting Garmin FIT raw landing", json_output=options.json_output)
    try:
        fit_args = download_garmin_fit.parse_args(
            [
                "--destination",
                "s3",
                "--mode",
                "incremental",
                "--tokenstore",
                options.tokenstore,
                "--limit",
                str(options.fit_limit),
                "--no-interactive",
            ]
        )
        fit_result = run_with_heartbeat(
            "fit_raw",
            lambda: fit_runner(fit_args, allow_prompt=not options.no_input),
            json_output=options.json_output,
        )
    except Exception as exc:
        fail_stage(
            manifest,
            state_dir,
            "fit_raw",
            {},
            raw_landing_failure_message("FIT", exc),
            RAW_FAILURE_EXIT_CODE,
        )
        raise AssertionError("unreachable")

    details = fit_result_details(fit_result)
    complete_stage(manifest, state_dir, "fit_raw", details)
    report_progress(
        "fit_raw",
        f"completed: {details['downloaded_count']} downloaded, "
        f"{details['skipped_existing_count']} existing",
        json_output=options.json_output,
    )


def run_health_raw_stage(
    manifest: RunManifest,
    state_dir: Path,
    options: RefreshOptions,
    health_runner: Callable[..., GarminHealthDownloadResult],
) -> None:
    start_stage(manifest, state_dir, "health_raw", {})
    report_progress("health_raw", "starting Garmin health raw landing", json_output=options.json_output)
    try:
        health_args = download_garmin_health.parse_args(
            [
                "--destination",
                "s3",
                "--mode",
                "incremental",
                "--tokenstore",
                options.tokenstore,
                "--no-interactive",
            ]
        )
        health_result = run_with_heartbeat(
            "health_raw",
            lambda: health_runner(health_args, allow_prompt=not options.no_input),
            json_output=options.json_output,
        )
    except Exception as exc:
        fail_stage(
            manifest,
            state_dir,
            "health_raw",
            {},
            raw_landing_failure_message("Health", exc),
            RAW_FAILURE_EXIT_CODE,
        )
        raise AssertionError("unreachable")

    details = health_result_details(health_result)
    if health_result.endpoint_failures:
        fail_stage(
            manifest,
            state_dir,
            "health_raw",
            details,
            "Health raw landing completed with endpoint failures.",
            RAW_FAILURE_EXIT_CODE,
        )
    complete_stage(manifest, state_dir, "health_raw", details)
    report_progress(
        "health_raw",
        f"completed: {details['written_count']} written, "
        f"{details['skipped_existing_count']} existing",
        json_output=options.json_output,
    )


def execute_incremental(
    options: RefreshOptions,
    project_root: Path,
    *,
    state_dir: Path | None = None,
    command_runner: CommandRunner = default_command_runner,
    bundle_summary_runner: BundleSummaryRunner | None = None,
    fit_runner: Callable[..., Any] = download_garmin_fit.run,
    health_runner: Callable[..., GarminHealthDownloadResult] = download_garmin_health.run,
) -> RunManifest:
    if options.source == "health" and options.no_publish:
        raise PipelineError("--no-publish applies to FIT refreshes only.", USAGE_FAILURE_EXIT_CODE)
    run_preflight(
        project_root,
        options.tokenstore,
        options.source,
        no_input=options.no_input,
        stages=frozenset({"raw", "bronze", "dbt", "geocode", "publish"})
        if options.source == "fit" and not options.no_publish
        else frozenset({"raw", "bronze", "dbt"}),
    )
    if not options.dry_run:
        ensure_bundle_job_deployed(
            project_root,
            options.source,
            options.databricks_target,
            bundle_summary_runner,
        )
    resolved_state_dir = state_dir or get_state_dir()

    with RefreshLock(resolved_state_dir, f"source-{options.source}"):
        manifest = RunManifest.create(f"refresh incremental {options.source}", asdict(options))
        write_manifest(resolved_state_dir, manifest)

        stage_names = [f"{options.source}_raw", f"bronze_{options.source}"]
        stage_names.append(f"dbt_{options.source}")
        if options.source == "fit" and not options.no_publish:
            stage_names.append("geocode_cities")
        if options.source == "fit" and not options.no_publish:
            stage_names.append("publish_fit")

        if options.dry_run:
            for name in stage_names:
                manifest.start_stage(name)
                manifest.finish_stage(name, "skipped", details={"reason": "dry run"})
                report_progress(name, "skipped (dry run)", json_output=options.json_output)
            manifest.finish("succeeded")
            write_manifest(resolved_state_dir, manifest)
            return manifest

        if options.source == "fit":
            run_fit_raw_stage(manifest, resolved_state_dir, options, fit_runner)
        else:
            run_health_raw_stage(manifest, resolved_state_dir, options, health_runner)

        run_bronze_jobs(
            manifest,
            resolved_state_dir,
            project_root,
            options.source,
            options.databricks_target,
            False,
            command_runner,
            json_output=options.json_output,
        )

        run_command_stage(
            manifest,
            resolved_state_dir,
            f"dbt_{options.source}",
            [
                "uv",
                "run",
                "dbt",
                "build",
                "--project-dir",
                "dbt",
                "--selector",
                f"{options.source}_refresh",
                "--target-path",
                f"target/{options.source}",
            ],
            project_root,
            DBT_FAILURE_EXIT_CODE,
            command_runner,
            json_output=options.json_output,
        )

        if options.source == "fit" and not options.no_publish:
            run_command_stage(
                manifest,
                resolved_state_dir,
                "geocode_cities",
                [
                    "uv",
                    "run",
                    "python",
                    "scripts/geocode_cities.py",
                ],
                project_root,
                GEOCODE_FAILURE_EXIT_CODE,
                command_runner,
                json_output=options.json_output,
            )

        if options.source == "fit" and not options.no_publish:
            run_command_stage(
                manifest,
                resolved_state_dir,
                "publish_fit",
                [
                    "uv",
                    "run",
                    "python",
                    "scripts/sync_site_supabase.py",
                    "--no-progress",
                ],
                project_root,
                PUBLISH_FAILURE_EXIT_CODE,
                command_runner,
                json_output=options.json_output,
            )

        manifest.finish("succeeded")
        write_manifest(resolved_state_dir, manifest)
        return manifest


def skip_stages(
    manifest: RunManifest,
    state_dir: Path,
    stage_names: list[str],
    *,
    json_output: bool,
) -> RunManifest:
    for name in stage_names:
        manifest.start_stage(name)
        manifest.finish_stage(name, "skipped", details={"reason": "dry run"})
        report_progress(name, "skipped (dry run)", json_output=json_output)
    manifest.finish("succeeded")
    write_manifest(state_dir, manifest)
    return manifest


def raw_namespace(args: argparse.Namespace) -> argparse.Namespace:
    source = cast(RefreshSource, args.source)
    bucket_env = "GARMIN_FIT_S3_BUCKET" if source == "fit" else "GARMIN_HEALTH_S3_BUCKET"
    prefix_env = "GARMIN_FIT_S3_PREFIX" if source == "fit" else "GARMIN_HEALTH_S3_PREFIX"
    default_prefix = "garmin/fit" if source == "fit" else "garmin/health/daily"
    bucket = args.s3_bucket or os.getenv(bucket_env) or os.getenv("GARMIN_FIT_S3_BUCKET")
    prefix = args.s3_prefix or os.getenv(prefix_env, default_prefix)
    end_date = args.end_date or date.today()

    if args.mode == "range-overwrite":
        if not args.confirm:
            raise PipelineError(
                "--mode range-overwrite requires --confirm.", USAGE_FAILURE_EXIT_CODE
            )
        if args.start_date is None or args.end_date is None:
            raise PipelineError(
                "--mode range-overwrite requires --start-date and --end-date.",
                USAGE_FAILURE_EXIT_CODE,
            )
        if args.end_date < args.start_date:
            raise PipelineError(
                "--end-date must be on or after --start-date.", USAGE_FAILURE_EXIT_CODE
            )

    values: dict[str, Any] = {
        "tokenstore": args.tokenstore,
        "destination": "s3",
        "s3_bucket": bucket,
        "s3_prefix": prefix,
        "mode": args.mode,
        "start_date": args.start_date,
        "end_date": end_date,
    }
    if source == "fit":
        values["limit"] = args.fit_limit
    return argparse.Namespace(**values)


def run_raw_stage(
    manifest: RunManifest,
    state_dir: Path,
    source: RefreshSource,
    raw_args: argparse.Namespace,
    *,
    no_input: bool,
    json_output: bool,
    fit_runner: Callable[..., Any] = download_garmin_fit.run,
    health_runner: Callable[..., GarminHealthDownloadResult] = download_garmin_health.run,
) -> None:
    stage_name = f"{source}_raw"
    start_stage(manifest, state_dir, stage_name, {})
    report_progress(stage_name, "starting Garmin raw landing", json_output=json_output)
    try:
        if source == "fit":
            result = run_with_heartbeat(
                stage_name,
                lambda: fit_runner(raw_args, allow_prompt=not no_input),
                json_output=json_output,
            )
            details = fit_result_details(result)
        else:
            result = run_with_heartbeat(
                stage_name,
                lambda: health_runner(raw_args, allow_prompt=not no_input),
                json_output=json_output,
            )
            details = health_result_details(result)
    except Exception as exc:
        fail_stage(
            manifest,
            state_dir,
            stage_name,
            {},
            raw_landing_failure_message(source.upper(), exc),
            RAW_FAILURE_EXIT_CODE,
        )

    if source == "health" and result.endpoint_failures:
        fail_stage(
            manifest,
            state_dir,
            stage_name,
            details,
            "Health raw landing completed with endpoint failures.",
            RAW_FAILURE_EXIT_CODE,
        )
    complete_stage(manifest, state_dir, stage_name, details)
    report_progress(stage_name, "completed successfully", json_output=json_output)


def execute_raw(
    args: argparse.Namespace,
    project_root: Path,
    *,
    state_dir: Path | None = None,
    fit_runner: Callable[..., Any] = download_garmin_fit.run,
    health_runner: Callable[..., GarminHealthDownloadResult] = download_garmin_health.run,
) -> RunManifest:
    source = cast(RefreshSource, args.source)
    run_preflight(
        project_root,
        args.tokenstore,
        source,
        no_input=args.no_input,
        stages=frozenset({"raw"}),
        raw_s3_bucket=args.s3_bucket,
    )
    raw_args = raw_namespace(args)
    resolved_state_dir = state_dir or get_state_dir()
    options = {
        "source": source,
        "mode": args.mode,
        "s3_bucket": raw_args.s3_bucket,
        "s3_prefix": raw_args.s3_prefix,
        "start_date": raw_args.start_date.isoformat() if raw_args.start_date else None,
        "end_date": raw_args.end_date.isoformat(),
    }
    with RefreshLock(resolved_state_dir, f"source-{source}"):
        manifest = RunManifest.create(f"raw {source}", options)
        write_manifest(resolved_state_dir, manifest)
        if args.dry_run:
            return skip_stages(manifest, resolved_state_dir, [f"{source}_raw"], json_output=args.json_output)
        run_raw_stage(
            manifest,
            resolved_state_dir,
            source,
            raw_args,
            no_input=args.no_input,
            json_output=args.json_output,
            fit_runner=fit_runner,
            health_runner=health_runner,
        )
        manifest.finish("succeeded")
        write_manifest(resolved_state_dir, manifest)
        return manifest


def dbt_command(source: str) -> list[str]:
    argv = ["uv", "run", "dbt", "build", "--project-dir", "dbt"]
    if source != "all":
        argv.extend(["--selector", f"{source}_refresh", "--target-path", f"target/{source}"])
    return argv


def source_locks(state_dir: Path, source: str) -> ExitStack:
    locks = ExitStack()
    for selected_source in (("fit", "health") if source == "all" else (source,)):
        locks.enter_context(RefreshLock(state_dir, f"source-{selected_source}"))
    return locks


def execute_dbt(
    args: argparse.Namespace,
    project_root: Path,
    *,
    state_dir: Path | None = None,
    command_runner: CommandRunner = default_command_runner,
) -> RunManifest:
    source = args.source
    preflight_source = "fit" if source == "all" else cast(RefreshSource, source)
    run_preflight(project_root, default_tokenstore(), preflight_source, no_input=False, stages=frozenset({"dbt"}))
    resolved_state_dir = state_dir or get_state_dir()
    stage_name = f"dbt_{source}"
    with source_locks(resolved_state_dir, source):
        manifest = RunManifest.create(f"dbt {source}", {"source": source})
        write_manifest(resolved_state_dir, manifest)
        if args.dry_run:
            return skip_stages(manifest, resolved_state_dir, [stage_name], json_output=args.json_output)
        run_command_stage(
            manifest,
            resolved_state_dir,
            stage_name,
            dbt_command(source),
            project_root,
            DBT_FAILURE_EXIT_CODE,
            command_runner,
            json_output=args.json_output,
        )
        manifest.finish("succeeded")
        write_manifest(resolved_state_dir, manifest)
        return manifest


def execute_geocode(
    args: argparse.Namespace,
    project_root: Path,
    *,
    state_dir: Path | None = None,
    command_runner: CommandRunner = default_command_runner,
) -> RunManifest:
    run_preflight(project_root, default_tokenstore(), "fit", no_input=False, stages=frozenset({"geocode"}))
    resolved_state_dir = state_dir or get_state_dir()
    with RefreshLock(resolved_state_dir, "source-fit"):
        manifest = RunManifest.create("geocode", {})
        write_manifest(resolved_state_dir, manifest)
        if args.dry_run:
            return skip_stages(manifest, resolved_state_dir, ["geocode_cities"], json_output=args.json_output)
        run_command_stage(
            manifest,
            resolved_state_dir,
            "geocode_cities",
            ["uv", "run", "python", "scripts/geocode_cities.py"],
            project_root,
            GEOCODE_FAILURE_EXIT_CODE,
            command_runner,
            json_output=args.json_output,
        )
        manifest.finish("succeeded")
        write_manifest(resolved_state_dir, manifest)
        return manifest


def execute_full_refresh(
    args: argparse.Namespace,
    project_root: Path,
    *,
    state_dir: Path | None = None,
    command_runner: CommandRunner = default_command_runner,
    bundle_summary_runner: BundleSummaryRunner | None = None,
) -> RunManifest:
    if not args.confirm:
        raise PipelineError("--mode full requires --confirm.", USAGE_FAILURE_EXIT_CODE)
    source = cast(RefreshSource, args.source)
    if source == "health" and args.no_publish:
        raise PipelineError("--no-publish applies to FIT refreshes only.", USAGE_FAILURE_EXIT_CODE)
    stages = frozenset({"bronze", "dbt", "geocode", "publish"}) if source == "fit" and not args.no_publish else frozenset({"bronze", "dbt"})
    run_preflight(project_root, args.tokenstore, source, no_input=args.no_input, stages=stages)
    resolved_state_dir = state_dir or get_state_dir()
    stage_names = [f"bronze_{source}", f"dbt_{source}"]
    if source == "fit" and not args.no_publish:
        stage_names.extend(["geocode_cities", "publish_fit"])

    with RefreshLock(resolved_state_dir, f"source-{source}"):
        manifest = RunManifest.create(f"refresh {source} full", {"source": source, "mode": "full"})
        write_manifest(resolved_state_dir, manifest)
        if args.dry_run:
            return skip_stages(manifest, resolved_state_dir, stage_names, json_output=args.json_output)
        ensure_bundle_job_deployed(project_root, source, args.databricks_target, bundle_summary_runner)
        run_bronze_jobs(
            manifest,
            resolved_state_dir,
            project_root,
            source,
            args.databricks_target,
            True,
            command_runner,
            json_output=args.json_output,
        )
        run_command_stage(
            manifest,
            resolved_state_dir,
            f"dbt_{source}",
            dbt_command(source),
            project_root,
            DBT_FAILURE_EXIT_CODE,
            command_runner,
            json_output=args.json_output,
        )
        if source == "fit" and not args.no_publish:
            run_command_stage(
                manifest,
                resolved_state_dir,
                "geocode_cities",
                ["uv", "run", "python", "scripts/geocode_cities.py"],
                project_root,
                GEOCODE_FAILURE_EXIT_CODE,
                command_runner,
                json_output=args.json_output,
            )
            run_command_stage(
                manifest,
                resolved_state_dir,
                "publish_fit",
                ["uv", "run", "python", "scripts/sync_site_supabase.py", "--no-progress", "--full"],
                project_root,
                PUBLISH_FAILURE_EXIT_CODE,
                command_runner,
                json_output=args.json_output,
            )
        manifest.finish("succeeded")
        write_manifest(resolved_state_dir, manifest)
        return manifest


def execute_bronze(
    args: argparse.Namespace,
    project_root: Path,
    *,
    state_dir: Path | None = None,
    command_runner: CommandRunner = default_command_runner,
    bundle_summary_runner: BundleSummaryRunner | None = None,
) -> RunManifest:
    full_refresh = args.mode == "full"
    if full_refresh and not args.confirm:
        raise PipelineError(
            "--mode full requires --confirm because it replaces bronze tables from raw data.",
            USAGE_FAILURE_EXIT_CODE,
        )

    resolved_state_dir = state_dir or get_state_dir()
    selected_sources = ("fit", "health") if args.source == "all" else (args.source,)
    with ExitStack() as locks:
        for source in selected_sources:
            locks.enter_context(RefreshLock(resolved_state_dir, f"source-{source}"))
        for source in selected_sources:
            refresh_source = cast(RefreshSource, source)
            run_preflight(
                project_root,
                default_tokenstore(),
                refresh_source,
                no_input=False,
                stages=frozenset({"bronze"}),
            )
        manifest = RunManifest.create(
            "bronze",
            {
                "source": args.source,
                "mode": args.mode,
                "databricks_target": args.databricks_target,
            },
        )
        write_manifest(resolved_state_dir, manifest)
        if args.dry_run:
            return skip_stages(
                manifest,
                resolved_state_dir,
                [f"bronze_{source}" for source in selected_sources],
                json_output=args.json_output,
            )
        for source in selected_sources:
            ensure_bundle_job_deployed(
                project_root,
                cast(RefreshSource, source),
                args.databricks_target,
                bundle_summary_runner,
            )
        run_bronze_jobs(
            manifest,
            resolved_state_dir,
            project_root,
            args.source,
            args.databricks_target,
            full_refresh,
            command_runner,
            json_output=args.json_output,
        )
        manifest.finish("succeeded")
        write_manifest(resolved_state_dir, manifest)
        return manifest


def execute_publish(
    args: argparse.Namespace,
    project_root: Path,
    *,
    state_dir: Path | None = None,
    command_runner: CommandRunner = default_command_runner,
) -> RunManifest:
    full = args.mode == "full"
    if full and not args.confirm:
        raise PipelineError(
            "--mode full requires --confirm because it forces every Supabase export to reload.",
            USAGE_FAILURE_EXIT_CODE,
        )

    resolved_state_dir = state_dir or get_state_dir()
    with RefreshLock(resolved_state_dir, "source-fit"):
        run_preflight(
            project_root,
            default_tokenstore(),
            "fit",
            no_input=False,
            stages=frozenset({"publish"}),
        )
        manifest = RunManifest.create("publish", {"mode": args.mode})
        write_manifest(resolved_state_dir, manifest)
        if args.dry_run:
            return skip_stages(manifest, resolved_state_dir, ["publish_fit"], json_output=args.json_output)
        argv = [
            "uv",
            "run",
            "python",
            "scripts/sync_site_supabase.py",
            "--no-progress",
        ]
        if args.supabase_db_url:
            argv.extend(["--supabase-db-url", args.supabase_db_url])
        if full:
            argv.append("--full")
        run_command_stage(
            manifest,
            resolved_state_dir,
            "publish_fit",
            argv,
            project_root,
            PUBLISH_FAILURE_EXIT_CODE,
            command_runner,
            json_output=args.json_output,
        )
        manifest.finish("succeeded")
        write_manifest(resolved_state_dir, manifest)
        return manifest


def format_duration(seconds: float | None) -> str:
    if seconds is None:
        return "-"
    if seconds < 60:
        return f"{seconds:.1f}s"

    minutes, remaining_seconds = divmod(seconds, 60)
    return f"{int(minutes)}m {remaining_seconds:04.1f}s"


def print_execution_summary(manifest: RunManifest, *, json_output: bool) -> None:
    rows = [
        (name, stage.status, format_duration(stage.duration_seconds))
        for name, stage in manifest.stages.items()
    ]
    phase_width = max([len("Phase"), *(len(name) for name, _, _ in rows)])
    status_width = max(
        [len("Status"), len(manifest.status), *(len(status) for _, status, _ in rows)]
    )
    duration_width = max(
        [len("Duration"), *(len(duration) for _, _, duration in rows), len(format_duration(manifest.duration_seconds))]
    )
    output = progress_output(json_output)

    print("\nExecution timing", file=output)
    print(
        f"{'Phase':<{phase_width}}  {'Status':<{status_width}}  {'Duration':>{duration_width}}",
        file=output,
    )
    print(
        f"{'-' * phase_width}  {'-' * status_width}  {'-' * duration_width}",
        file=output,
    )
    for name, status, duration in rows:
        print(f"{name:<{phase_width}}  {status:<{status_width}}  {duration:>{duration_width}}", file=output)
    print(
        f"{'Total':<{phase_width}}  {manifest.status:<{status_width}}  "
        f"{format_duration(manifest.duration_seconds):>{duration_width}}",
        file=output,
        flush=True,
    )


def print_manifest(manifest: RunManifest, *, json_output: bool) -> None:
    if json_output:
        print(json.dumps(manifest.to_dict(), indent=2, sort_keys=True))
        print_execution_summary(manifest, json_output=True)
        return

    print(f"Pipeline run {manifest.run_id}: {manifest.status}")
    print_execution_summary(manifest, json_output=False)


def main(argv: list[str] | None = None) -> int:
    load_dotenv(get_project_root() / ".env")
    parser = build_parser()
    args = parser.parse_args(argv)
    project_root = get_project_root()

    try:
        if args.command == "preflight":
            if args.stage in {"geocode", "publish"} and args.source is not None:
                raise PipelineError(
                    f"preflight {args.stage} does not take a source.", USAGE_FAILURE_EXIT_CODE
                )
            if args.stage not in {"geocode", "publish"} and args.source is None:
                raise PipelineError(
                    f"preflight {args.stage} requires a source.", USAGE_FAILURE_EXIT_CODE
                )
            if args.stage in {"raw", "refresh"} and args.source == "all":
                raise PipelineError(
                    f"preflight {args.stage} requires fit or health, not all.",
                    USAGE_FAILURE_EXIT_CODE,
                )
            source = "fit" if args.source in {None, "all"} else cast(RefreshSource, args.source)
            stage_sets = {
                "raw": frozenset({"raw"}),
                "bronze": frozenset({"bronze"}),
                "dbt": frozenset({"dbt"}),
                "geocode": frozenset({"geocode"}),
                "publish": frozenset({"publish"}),
                "refresh": frozenset({"raw", "bronze", "dbt", "geocode", "publish"})
                if source == "fit"
                else frozenset({"raw", "bronze", "dbt"}),
            }
            checks = run_preflight(
                project_root,
                args.tokenstore,
                source,
                no_input=args.no_input,
                stages=stage_sets[args.stage],
            )
            if args.json_output:
                print(json.dumps({"status": "succeeded", "checks": checks}, indent=2, sort_keys=True))
            else:
                print("Preflight succeeded:")
                for check in checks:
                    print(f"  {check}")
            return 0

        if args.command == "refresh":
            manifest = (
                execute_incremental(refresh_options(args), project_root)
                if args.mode == "incremental"
                else execute_full_refresh(args, project_root)
            )
            print_manifest(manifest, json_output=args.json_output)
            return 0

        if args.command == "raw":
            manifest = execute_raw(args, project_root)
            print_manifest(manifest, json_output=args.json_output)
            return 0

        if args.command == "bronze":
            manifest = execute_bronze(args, project_root)
            print_manifest(manifest, json_output=args.json_output)
            return 0

        if args.command == "dbt":
            manifest = execute_dbt(args, project_root)
            print_manifest(manifest, json_output=args.json_output)
            return 0

        if args.command == "geocode":
            manifest = execute_geocode(args, project_root)
            print_manifest(manifest, json_output=args.json_output)
            return 0

        if args.command == "publish":
            manifest = execute_publish(args, project_root)
            print_manifest(manifest, json_output=args.json_output)
            return 0

        if args.command == "status":
            stored_manifest = (
                load_latest_manifest(get_state_dir()) if args.latest else load_manifest(get_state_dir(), args.run_id)
            )
            if args.json_output:
                print(json.dumps(stored_manifest, indent=2, sort_keys=True))
            else:
                print(f"Pipeline run {stored_manifest['run_id']}: {stored_manifest['status']}")
                for name, stage in stored_manifest.get("stages", {}).items():
                    print(f"  {name}: {stage['status']}")
            return 0

        raise AssertionError(f"Unsupported command: {args.command}")
    except RefreshLockHeldError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return LOCK_FAILURE_EXIT_CODE
    except PipelineError as exc:
        if exc.manifest is not None:
            print_manifest(exc.manifest, json_output=getattr(args, "json_output", False))
        print(f"error: {exc}", file=sys.stderr)
        return exc.exit_code
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return MANIFEST_FAILURE_EXIT_CODE


if __name__ == "__main__":
    raise SystemExit(main())
