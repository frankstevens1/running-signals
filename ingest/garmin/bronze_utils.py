from __future__ import annotations

import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

import pandas as pd


S3A_PREFIX = "s3a://"


def is_remote_source(source_path: str) -> bool:
    return source_path.startswith(S3A_PREFIX)


def normalize_source_path(source_path: str | Path) -> Path:
    text = str(source_path)

    if text.startswith("dbfs:/"):
        return Path("/dbfs") / text.removeprefix("dbfs:/").lstrip("/")

    if text.startswith("file:/"):
        return Path(text.removeprefix("file:"))

    if text.startswith(S3A_PREFIX):
        return Path(text)

    return Path(text)


def download_to_tempfile(content: bytes, suffix: str) -> Path:
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp.write(content)
    tmp.close()
    return Path(tmp.name)


def cleanup_tempfiles(paths: list[Path]) -> None:
    for path in paths:
        if path.exists():
            path.unlink()


def normalize_datetime(value: Any) -> datetime | None:
    if value is None:
        return None

    timestamp = pd.Timestamp(value)

    if timestamp.tzinfo is None:
        timestamp = timestamp.tz_localize(UTC)
    else:
        timestamp = timestamp.tz_convert(UTC)

    return cast(datetime, timestamp.to_pydatetime())


def align_columns(frame: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    aligned = frame.copy()

    for column in columns:
        if column not in aligned.columns:
            aligned[column] = pd.NA

    return aligned[columns]


def table_exists(spark: Any, table_name: str) -> bool:
    try:
        return bool(spark.catalog.tableExists(table_name))
    except Exception:
        return False


def quote_sql_string(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"
