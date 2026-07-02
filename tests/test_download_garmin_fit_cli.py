from __future__ import annotations

from scripts.download_garmin_fit import parse_args


def test_parse_args_loads_s3_defaults_from_project_env(
    monkeypatch,
    tmp_path,
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
