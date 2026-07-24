from __future__ import annotations

import json
import subprocess
from datetime import date
from pathlib import Path
from typing import Any

import pytest
from garminconnect import GarminConnectAuthenticationError

from ingest.garmin.download import GarminFitDownloadResult
from ingest.garmin.health_download import (
    GarminHealthDownloadResult,
    GarminHealthEndpointFailure,
)
from scripts import pipeline
from scripts.pipeline_state import RefreshLock, RefreshLockHeldError, RunManifest


@pytest.fixture(autouse=True)
def deployed_dev_bundle(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_summary(
        argv: list[str], cwd: Path
    ) -> subprocess.CompletedProcess[str]:
        summary = {
            "resources": {
                "jobs": {
                    "garmin_fit_bronze_ingestion": {"id": "fit-job"},
                    "garmin_health_bronze_ingestion": {"id": "health-job"},
                }
            }
        }
        return subprocess.CompletedProcess(argv, 0, json.dumps(summary), "")

    monkeypatch.setattr(pipeline, "default_bundle_summary_runner", fake_summary)


@pytest.fixture
def configured_environment(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> str:
    for name, value in {
        "GARMIN_FIT_S3_BUCKET": "raw-bucket",
        "GARMIN_HEALTH_S3_BUCKET": "raw-bucket",
        "DATABRICKS_HOST": "https://example.cloud.databricks.com",
        "DATABRICKS_TOKEN": "token",
        "DATABRICKS_HTTP_PATH": "/sql/1.0/warehouses/warehouse",
        "DATABRICKS_CATALOG": "running_signals",
        "DATABRICKS_GOLD_SCHEMA": "gold",
        "SUPABASE_DB_URL": "postgresql://example",
    }.items():
        monkeypatch.setenv(name, value)

    tokenstore = tmp_path / "garmin-tokenstore"
    tokenstore.write_text("token")
    dbt_profiles_dir = tmp_path / "dbt"
    dbt_profiles_dir.mkdir()
    (dbt_profiles_dir / "profiles.yml").write_text("running_signals: {}\n")
    monkeypatch.setenv("DBT_PROFILES_DIR", str(dbt_profiles_dir))
    return str(tokenstore)


def options(tokenstore: str, **overrides: Any) -> pipeline.RefreshOptions:
    values: dict[str, Any] = {
        "source": "fit",
        "tokenstore": tokenstore,
        "fit_limit": 200,
        "no_input": True,
        "no_publish": False,
        "dry_run": False,
        "json_output": True,
        "databricks_target": "dev",
    }
    values.update(overrides)
    return pipeline.RefreshOptions(**values)


def fit_result() -> GarminFitDownloadResult:
    return GarminFitDownloadResult(
        downloaded_paths=["s3://raw-bucket/garmin/fit/101.fit"],
        skipped_existing_paths=[],
        deleted_existing_paths=[],
        inspected_activity_count=1,
    )


def health_result() -> GarminHealthDownloadResult:
    return GarminHealthDownloadResult(
        written_paths=["s3://raw-bucket/garmin/health/daily/calendar_date=2026-01-02/hrv.json"],
        endpoint_failures=[],
        inspected_day_count=1,
    )


def test_incremental_refresh_runs_stages_in_order(
    configured_environment: str,
    tmp_path: Path,
) -> None:
    command_calls: list[tuple[list[str], Path]] = []
    prompt_flags: list[bool] = []

    def fake_command(
        argv: list[str], cwd: Path, stage: str, json_output: bool
    ) -> subprocess.CompletedProcess[str]:
        command_calls.append((argv, cwd))
        return subprocess.CompletedProcess(argv, 0, "", "")

    def fake_fit_runner(args: object, *, allow_prompt: bool) -> GarminFitDownloadResult:
        prompt_flags.append(allow_prompt)
        return fit_result()

    def unexpected_health_runner(
        args: object, *, allow_prompt: bool
    ) -> GarminHealthDownloadResult:
        raise AssertionError("FIT refresh must not invoke health landing")

    manifest = pipeline.execute_incremental(
        options(configured_environment),
        Path.cwd(),
        state_dir=tmp_path / "state",
        command_runner=fake_command,
        fit_runner=fake_fit_runner,
        health_runner=unexpected_health_runner,
    )

    assert prompt_flags == [False]
    assert [call[0] for call in command_calls] == [
        [
            "databricks",
            "bundle",
            "run",
            "--target",
            "dev",
            "garmin_fit_bronze_ingestion",
        ],
        [
            "uv",
            "run",
            "dbt",
            "build",
            "--project-dir",
            "dbt",
            "--selector",
            "fit_refresh",
            "--target-path",
            "target/fit",
        ],
        [
            "uv",
            "run",
            "python",
            "scripts/sync_site_supabase.py",
            "--no-progress",
        ],
    ]
    assert manifest.status == "succeeded"
    assert list(manifest.stages) == ["fit_raw", "bronze_fit", "dbt_fit", "publish_fit"]
    assert [stage.status for stage in manifest.stages.values()] == ["succeeded"] * 4
    assert (tmp_path / "state" / f"{manifest.run_id}.json").exists()


def test_health_endpoint_failure_stops_downstream_stages(
    configured_environment: str,
    tmp_path: Path,
) -> None:
    commands: list[list[str]] = []

    def fake_command(
        argv: list[str], cwd: Path, stage: str, json_output: bool
    ) -> subprocess.CompletedProcess[str]:
        commands.append(argv)
        return subprocess.CompletedProcess(argv, 0, "", "")

    failed_health_result = GarminHealthDownloadResult(
        written_paths=[],
        endpoint_failures=[
            GarminHealthEndpointFailure(
                calendar_date=date(2026, 1, 2),
                payload_type="sleep",
                source_method="get_sleep_data",
                error_type="RuntimeError",
                error_message="unavailable",
            )
        ],
        inspected_day_count=1,
    )

    with pytest.raises(pipeline.PipelineError) as error:
        pipeline.execute_incremental(
            options(configured_environment, source="health"),
            Path.cwd(),
            state_dir=tmp_path / "state",
            command_runner=fake_command,
            fit_runner=lambda args, allow_prompt: pytest.fail("health invoked FIT landing"),
            health_runner=lambda args, allow_prompt: failed_health_result,
        )

    assert error.value.exit_code == pipeline.RAW_FAILURE_EXIT_CODE
    assert commands == []
    assert error.value.manifest is not None
    assert error.value.manifest.stages["health_raw"].status == "failed"


def test_health_refresh_runs_only_health_pipeline(
    configured_environment: str,
    tmp_path: Path,
) -> None:
    commands: list[list[str]] = []

    def fake_command(
        argv: list[str], cwd: Path, stage: str, json_output: bool
    ) -> subprocess.CompletedProcess[str]:
        commands.append(argv)
        return subprocess.CompletedProcess(argv, 0, "", "")

    manifest = pipeline.execute_incremental(
        options(configured_environment, source="health"),
        Path.cwd(),
        state_dir=tmp_path / "state",
        command_runner=fake_command,
        fit_runner=lambda args, allow_prompt: pytest.fail("health invoked FIT landing"),
        health_runner=lambda args, allow_prompt: health_result(),
    )

    assert commands == [
        [
            "databricks",
            "bundle",
            "run",
            "--target",
            "dev",
            "garmin_health_bronze_ingestion",
        ],
        [
            "uv",
            "run",
            "dbt",
            "build",
            "--project-dir",
            "dbt",
            "--selector",
            "health_refresh",
            "--target-path",
            "target/health",
        ],
    ]
    assert list(manifest.stages) == [
        "health_raw",
        "bronze_health",
        "dbt_health",
    ]


def test_dbt_failure_prevents_publish(
    configured_environment: str,
    tmp_path: Path,
) -> None:
    commands: list[list[str]] = []

    def fake_command(
        argv: list[str], cwd: Path, stage: str, json_output: bool
    ) -> subprocess.CompletedProcess[str]:
        commands.append(argv)
        returncode = 1 if argv[2:4] == ["dbt", "build"] else 0
        return subprocess.CompletedProcess(argv, returncode, "", "")

    with pytest.raises(pipeline.PipelineError) as error:
        pipeline.execute_incremental(
            options(configured_environment),
            Path.cwd(),
            state_dir=tmp_path / "state",
            command_runner=fake_command,
            fit_runner=lambda args, allow_prompt: fit_result(),
            health_runner=lambda args, allow_prompt: health_result(),
        )

    assert error.value.exit_code == pipeline.DBT_FAILURE_EXIT_CODE
    assert [call[:2] for call in commands] == [["databricks", "bundle"], ["uv", "run"]]


def test_dry_run_does_not_invoke_stages(
    configured_environment: str,
    tmp_path: Path,
) -> None:
    def unexpected_command(
        argv: list[str], cwd: Path, stage: str, json_output: bool
    ) -> subprocess.CompletedProcess[str]:
        raise AssertionError("dry run must not invoke a stage")

    def unexpected_fit_runner(args: object, *, allow_prompt: bool) -> GarminFitDownloadResult:
        raise AssertionError("dry run must not invoke a stage")

    def unexpected_health_runner(
        args: object, *, allow_prompt: bool
    ) -> GarminHealthDownloadResult:
        raise AssertionError("dry run must not invoke a stage")

    manifest = pipeline.execute_incremental(
        options(configured_environment, dry_run=True),
        Path.cwd(),
        state_dir=tmp_path / "state",
        command_runner=unexpected_command,
        fit_runner=unexpected_fit_runner,
        health_runner=unexpected_health_runner,
    )

    assert manifest.status == "succeeded"
    assert list(manifest.stages) == ["fit_raw", "bronze_fit", "dbt_fit", "publish_fit"]
    assert {stage.status for stage in manifest.stages.values()} == {"skipped"}


def test_refresh_lock_prevents_overlapping_runs(
    configured_environment: str,
    tmp_path: Path,
) -> None:
    state_dir = tmp_path / "state"

    with RefreshLock(state_dir, "source-fit"):
        with pytest.raises(RefreshLockHeldError):
            pipeline.execute_incremental(
                options(configured_environment),
                Path.cwd(),
                state_dir=state_dir,
            )


def test_fit_and_health_refresh_locks_are_independent(tmp_path: Path) -> None:
    state_dir = tmp_path / "state"

    with RefreshLock(state_dir, "source-fit"):
        with RefreshLock(state_dir, "source-health"):
            pass


def test_standalone_fit_commands_share_refresh_lock(tmp_path: Path) -> None:
    parser = pipeline.build_parser()
    bronze_args = parser.parse_args(["bronze", "--source", "fit"])
    publish_args = parser.parse_args(["publish"])
    state_dir = tmp_path / "state"

    with RefreshLock(state_dir, "source-fit"):
        with pytest.raises(RefreshLockHeldError):
            pipeline.execute_bronze(bronze_args, Path.cwd(), state_dir=state_dir)
        with pytest.raises(RefreshLockHeldError):
            pipeline.execute_publish(publish_args, Path.cwd(), state_dir=state_dir)


def test_full_bronze_uses_job_parameter_and_requires_confirmation(tmp_path: Path) -> None:
    parser = pipeline.build_parser()
    without_confirmation = parser.parse_args(["bronze", "--full-refresh"])

    with pytest.raises(pipeline.PipelineError, match="requires --confirm"):
        pipeline.execute_bronze(without_confirmation, Path.cwd(), state_dir=tmp_path / "state")

    commands: list[list[str]] = []

    def fake_command(
        argv: list[str], cwd: Path, stage: str, json_output: bool
    ) -> subprocess.CompletedProcess[str]:
        commands.append(argv)
        return subprocess.CompletedProcess(argv, 0, "", "")

    confirmed = parser.parse_args(["bronze", "--full-refresh", "--confirm"])
    pipeline.execute_bronze(
        confirmed,
        Path.cwd(),
        state_dir=tmp_path / "state",
        command_runner=fake_command,
    )

    assert commands[0] == [
        "databricks",
        "bundle",
        "run",
        "--target",
        "dev",
        "--params",
        "full_refresh=true",
        "garmin_fit_bronze_ingestion",
    ]


def test_preflight_requires_non_interactive_garmin_credentials(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.delenv("GARMIN_EMAIL", raising=False)
    monkeypatch.delenv("GARMIN_PASSWORD", raising=False)

    with pytest.raises(pipeline.PipelineError, match="Garmin token store"):
        pipeline.run_preflight(tmp_path, str(tmp_path / "missing-tokenstore"), no_input=True)


def test_preflight_rejects_non_warehouse_http_path(
    configured_environment: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABRICKS_HTTP_PATH", "/sql/1.0/endpoints/not-a-warehouse")

    with pytest.raises(pipeline.PipelineError, match="SQL warehouse"):
        pipeline.run_preflight(Path.cwd(), configured_environment, no_input=True)


def test_fit_preflight_does_not_require_health_s3_configuration(
    configured_environment: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("GARMIN_HEALTH_S3_BUCKET", raising=False)
    monkeypatch.delenv("GARMIN_HEALTH_S3_PREFIX", raising=False)

    checks = pipeline.run_preflight(
        Path.cwd(), configured_environment, "fit", no_input=True
    )

    assert "Garmin fit raw S3 configuration" in checks


def test_health_preflight_does_not_require_fit_s3_configuration(
    configured_environment: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("GARMIN_FIT_S3_BUCKET", raising=False)

    checks = pipeline.run_preflight(
        Path.cwd(), configured_environment, "health", no_input=True
    )

    assert "Garmin health raw S3 configuration" in checks


def test_health_preflight_does_not_require_supabase_configuration(
    configured_environment: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("SUPABASE_DB_URL")

    checks = pipeline.run_preflight(
        Path.cwd(), configured_environment, "health", no_input=True
    )

    assert "Hosted Supabase connection URL" not in checks


def test_publish_cli_is_fit_only() -> None:
    parser = pipeline.build_parser()

    args = parser.parse_args(["publish"])
    assert not hasattr(args, "group")

    with pytest.raises(SystemExit):
        parser.parse_args(["publish", "--group", "health"])


def test_undeployed_bundle_target_fails_before_raw_landing(
    configured_environment: str,
    tmp_path: Path,
) -> None:
    raw_called = False

    def undeployed_summary(
        argv: list[str], cwd: Path
    ) -> subprocess.CompletedProcess[str]:
        summary = {
            "resources": {
                "jobs": {
                    "garmin_fit_bronze_ingestion": {"modified_status": "created"}
                }
            }
        }
        return subprocess.CompletedProcess(argv, 0, json.dumps(summary), "")

    def unexpected_fit_runner(
        args: object, *, allow_prompt: bool
    ) -> GarminFitDownloadResult:
        nonlocal raw_called
        raw_called = True
        return fit_result()

    with pytest.raises(pipeline.PipelineError, match="not deployed for target missing") as error:
        pipeline.execute_incremental(
            options(configured_environment, databricks_target="missing"),
            Path.cwd(),
            state_dir=tmp_path / "state",
            bundle_summary_runner=undeployed_summary,
            fit_runner=unexpected_fit_runner,
        )

    assert error.value.exit_code == pipeline.USAGE_FAILURE_EXIT_CODE
    assert "databricks bundle deploy --target missing" in str(error.value)
    assert raw_called is False
    assert not (tmp_path / "state").exists()


def test_no_input_raw_failure_uses_raw_exit_code(
    configured_environment: str,
    tmp_path: Path,
) -> None:
    def fail_without_prompt(args: object, *, allow_prompt: bool) -> GarminFitDownloadResult:
        assert allow_prompt is False
        raise GarminConnectAuthenticationError("missing credentials")

    with pytest.raises(pipeline.PipelineError) as error:
        pipeline.execute_incremental(
            options(configured_environment),
            Path.cwd(),
            state_dir=tmp_path / "state",
            fit_runner=fail_without_prompt,
            health_runner=lambda args, allow_prompt: health_result(),
        )

    assert error.value.exit_code == pipeline.RAW_FAILURE_EXIT_CODE


def test_expired_aws_sso_session_includes_login_command(
    configured_environment: str,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("AWS_PROFILE", "local-sso")

    def fail_with_expired_sso(args: object, *, allow_prompt: bool) -> GarminFitDownloadResult:
        raise RuntimeError(
            "Error when retrieving token from sso: Token has expired and refresh failed"
        )

    with pytest.raises(pipeline.PipelineError) as error:
        pipeline.execute_incremental(
            options(configured_environment),
            Path.cwd(),
            state_dir=tmp_path / "state",
            fit_runner=fail_with_expired_sso,
            health_runner=lambda args, allow_prompt: health_result(),
        )

    assert error.value.exit_code == pipeline.RAW_FAILURE_EXIT_CODE
    assert str(error.value) == (
        "FIT raw landing failed: AWS SSO session expired. "
        "Run: aws sso login --profile local-sso"
    )


def test_status_returns_manifest_exit_code_for_missing_run(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(pipeline, "get_state_dir", lambda: tmp_path)

    assert pipeline.main(["status", "missing-run"]) == pipeline.MANIFEST_FAILURE_EXIT_CODE
    assert "No run manifest exists" in capsys.readouterr().err


def test_manifest_json_output_is_pretty_printed(capsys: pytest.CaptureFixture[str]) -> None:
    manifest = RunManifest.create("test", {"dry_run": True})
    manifest.start_stage("fit_raw")
    manifest.finish_stage("fit_raw", "succeeded")
    manifest.finish("succeeded")

    pipeline.print_manifest(manifest, json_output=True)

    captured = capsys.readouterr()
    assert captured.out.startswith("{\n  ")
    assert json.loads(captured.out)["command"] == "test"
    assert "Execution timing" in captured.err


def test_human_manifest_output_includes_execution_timing_table(
    capsys: pytest.CaptureFixture[str],
) -> None:
    manifest = RunManifest.create("test", {})
    manifest.start_stage("fit_raw")
    manifest.finish_stage("fit_raw", "succeeded")
    manifest.finish("succeeded")

    pipeline.print_manifest(manifest, json_output=False)

    output = capsys.readouterr().out
    assert "Execution timing" in output
    assert "Phase" in output
    assert "fit_raw" in output
    assert "Total" in output
    assert manifest.stages["fit_raw"].duration_seconds is not None
    assert manifest.duration_seconds is not None


def test_json_progress_is_written_to_stderr(capsys: pytest.CaptureFixture[str]) -> None:
    pipeline.report_progress("bronze_fit", "still running after 30s", json_output=True)

    captured = capsys.readouterr()
    assert captured.out == ""
    assert "[bronze_fit] still running after 30s" in captured.err
