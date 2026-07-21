from __future__ import annotations

from pathlib import Path

from pytest import MonkeyPatch

from scripts.download_garmin_fit import parse_args
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
            ]
        )
    )
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("GARMIN_FIT_S3_BUCKET", raising=False)
    monkeypatch.delenv("GARMIN_FIT_S3_PREFIX", raising=False)

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
            ]
        )
    )
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("GARMIN_HEALTH_S3_BUCKET", raising=False)
    monkeypatch.delenv("GARMIN_HEALTH_S3_PREFIX", raising=False)

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
