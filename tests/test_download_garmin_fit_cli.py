from __future__ import annotations

from datetime import date
from pathlib import Path
from types import SimpleNamespace

from pytest import MonkeyPatch

from ingest.garmin.health_download import GarminHealthDownloadResult, GarminHealthEndpointFailure
from scripts.download_garmin_fit import parse_args
from scripts import download_garmin_health
from scripts.download_garmin_health import parse_args as parse_health_args


def test_parse_args_loads_s3_defaults_from_project_env(
    monkeypatch: MonkeyPatch,
    tmp_path: Path,
) -> None:
    (tmp_path / "pyproject.toml").write_text("[project]\nname = \"test\"\n")
    (tmp_path / ".env").write_text(
        "\n".join(
            [
                "GARMIN_FIT_S3_BUCKET=env-bucket",
                "GARMIN_FIT_S3_PREFIX=env-prefix/fit",
                "AWS_REGION=eu-central-1",
                "AWS_PROFILE=running-signals-dev",
            ]
        )
    )
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("GARMIN_FIT_S3_BUCKET", raising=False)
    monkeypatch.delenv("GARMIN_FIT_S3_PREFIX", raising=False)
    monkeypatch.delenv("AWS_REGION", raising=False)
    monkeypatch.delenv("AWS_PROFILE", raising=False)

    args = parse_args(["--no-interactive"])

    assert args.destination == "s3"
    assert args.s3_bucket == "env-bucket"
    assert args.s3_prefix == "env-prefix/fit"


def test_parse_health_args_loads_s3_defaults_from_project_env(
    monkeypatch: MonkeyPatch,
    tmp_path: Path,
) -> None:
    (tmp_path / "pyproject.toml").write_text("[project]\nname = \"test\"\n")
    (tmp_path / ".env").write_text(
        "\n".join(
            [
                "GARMIN_HEALTH_S3_BUCKET=env-bucket",
                "GARMIN_HEALTH_S3_PREFIX=env-prefix/health",
                "AWS_REGION=eu-central-1",
                "AWS_PROFILE=running-signals-dev",
            ]
        )
    )
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("GARMIN_HEALTH_S3_BUCKET", raising=False)
    monkeypatch.delenv("GARMIN_HEALTH_S3_PREFIX", raising=False)
    monkeypatch.delenv("AWS_REGION", raising=False)
    monkeypatch.delenv("AWS_PROFILE", raising=False)

    args = parse_health_args(["--no-interactive"])

    assert args.destination == "s3"
    assert args.s3_bucket == "env-bucket"
    assert args.s3_prefix == "env-prefix/health"
    assert args.mode == "incremental"
    assert args.start_date is None


def test_parse_health_args_supports_range_overwrite_mode() -> None:
    args = parse_health_args(
        [
            "--destination",
            "local",
            "--mode",
            "range-overwrite",
            "--start-date",
            "2026-01-01",
            "--end-date",
            "2026-01-07",
            "--no-interactive",
        ]
    )

    assert args.mode == "range-overwrite"
    assert args.start_date.isoformat() == "2026-01-01"
    assert args.end_date.isoformat() == "2026-01-07"


def test_health_command_returns_nonzero_for_endpoint_failures(monkeypatch: MonkeyPatch) -> None:
    result = GarminHealthDownloadResult(
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
    monkeypatch.setattr(download_garmin_health, "parse_args", lambda argv: SimpleNamespace())
    monkeypatch.setattr(download_garmin_health, "print_download_options", lambda args: None)
    monkeypatch.setattr(download_garmin_health, "print_download_result", lambda result: None)
    monkeypatch.setattr(download_garmin_health, "run", lambda args: result)

    assert download_garmin_health.main([]) == 1
