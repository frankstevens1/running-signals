from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

import pandas as pd


def normalize_source_path(source_path: str | Path) -> Path:
    text = str(source_path)

    if text.startswith("dbfs:/"):
        return Path("/dbfs") / text.removeprefix("dbfs:/").lstrip("/")

    if text.startswith("file:/"):
        return Path(text.removeprefix("file:"))

    return Path(text)


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
