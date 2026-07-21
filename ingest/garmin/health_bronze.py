from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any, cast

import pandas as pd

from ingest.garmin.bronze_utils import (
    align_columns,
    cleanup_tempfiles,
    download_to_tempfile,
    is_remote_source,
    normalize_datetime,
    normalize_source_path,
    quote_sql_string,
    table_exists,
)
from ingest.garmin.bronze_schema import BRONZE_SCHEMA, HEALTH_PAYLOAD_TABLE
from ingest.garmin.health_store import HEALTH_PAYLOAD_TYPES, validate_health_payload_type


@dataclass(frozen=True)
class GarminHealthSourceFile:
    path: Path
    calendar_date: date
    payload_type: str
    source_file_size_bytes: int
    source_file_modification_time: datetime

    @property
    def key(self) -> tuple[date, str]:
        return (self.calendar_date, self.payload_type)


@dataclass(frozen=True)
class ExistingGarminHealthPayload:
    calendar_date: date
    payload_type: str
    source_file_size_bytes: int | None
    source_file_modification_time: datetime | None


@dataclass(frozen=True)
class GarminHealthBronzeIngestionPlan:
    source_files: list[GarminHealthSourceFile]
    files_to_ingest: list[GarminHealthSourceFile]
    changed_keys: list[tuple[date, str]]
    skipped_keys: list[tuple[date, str]]


@dataclass(frozen=True)
class GarminHealthBronzeIngestionResult:
    source_file_count: int
    ingested_file_count: int
    changed_keys: list[tuple[date, str]]
    skipped_keys: list[tuple[date, str]]
    row_count: int


def ingest_garmin_health_bronze(
    spark: Any,
    source_path: str,
    catalog: str,
    schema: str = BRONZE_SCHEMA,
    full_refresh: bool = False,
) -> GarminHealthBronzeIngestionResult:
    source_files = discover_health_payload_files(source_path, spark=spark)
    table_name = HEALTH_PAYLOAD_TABLE.full_name(catalog, schema)
    existing_payloads = (
        {}
        if full_refresh or not table_exists(spark, table_name)
        else read_existing_health_payload_files(spark, table_name)
    )

    plan = plan_health_payload_files(
        source_files,
        existing_payloads,
        full_refresh=full_refresh,
    )

    if not plan.files_to_ingest:
        return GarminHealthBronzeIngestionResult(
            source_file_count=len(plan.source_files),
            ingested_file_count=0,
            changed_keys=[],
            skipped_keys=plan.skipped_keys,
            row_count=0,
        )

    is_remote = is_remote_source(source_path)

    try:
        frame = build_health_bronze_frame(plan.files_to_ingest)
        validate_health_bronze_frame(frame)

        if full_refresh:
            write_health_bronze_table(spark, frame, catalog, schema, mode="overwrite")
        else:
            delete_existing_health_payloads(spark, plan.changed_keys, catalog, schema)
            write_health_bronze_table(spark, frame, catalog, schema, mode="append")
    finally:
        if is_remote:
            cleanup_tempfiles(
                [source_file.path for source_file in plan.files_to_ingest]
            )

    return GarminHealthBronzeIngestionResult(
        source_file_count=len(plan.source_files),
        ingested_file_count=len(plan.files_to_ingest),
        changed_keys=plan.changed_keys,
        skipped_keys=plan.skipped_keys,
        row_count=len(frame),
    )


def discover_health_payload_files(
    source_path: str | Path,
    spark: Any | None = None,
) -> list[GarminHealthSourceFile]:
    text = str(source_path)

    if is_remote_source(text) and spark is not None:
        return _discover_health_payload_files_via_spark(spark, text)

    path = normalize_source_path(source_path)

    if path.is_file():
        paths = [path] if path.suffix.lower() == ".json" else []
    else:
        paths = sorted(path.glob("calendar_date=*/*.json"))

    return [health_source_file_from_path(item) for item in paths]


def _discover_health_payload_files_via_spark(
    spark: Any,
    source_path: str,
) -> list[GarminHealthSourceFile]:
    df = spark.read.format("binaryFile").load(source_path)
    rows = df.select("path", "length", "modificationTime", "content").collect()
    return [health_source_file_from_spark_row(row) for row in rows]


def health_source_file_from_spark_row(row: Any) -> GarminHealthSourceFile:
    values = row.asDict()
    remote_path = str(values["path"])
    relative = remote_path.removeprefix("s3a://").split("/", maxsplit=1)[-1] if "s3a://" in remote_path else remote_path
    parts = relative.split("/")
    date_partition = parts[-2] if len(parts) >= 2 else ""
    file_name = parts[-1] if parts else ""

    if not date_partition.startswith("calendar_date="):
        raise ValueError(f"Health payload path is missing calendar_date partition: {remote_path}")

    calendar_date_text = date_partition.removeprefix("calendar_date=")

    try:
        calendar_date = date.fromisoformat(calendar_date_text)
    except ValueError as exc:
        raise ValueError(f"Invalid health payload calendar_date partition: {remote_path}") from exc

    payload_type = validate_health_payload_type(file_name.removesuffix(".json"))
    temp_path = download_to_tempfile(bytes(values["content"]), ".json")

    return GarminHealthSourceFile(
        path=temp_path,
        calendar_date=calendar_date,
        payload_type=payload_type,
        source_file_size_bytes=int(values["length"]),
        source_file_modification_time=normalize_datetime(values["modificationTime"]),
    )


def health_source_file_from_path(path: Path) -> GarminHealthSourceFile:
    date_partition = path.parent.name

    if not date_partition.startswith("calendar_date="):
        raise ValueError(f"Health payload path is missing calendar_date partition: {path}")

    calendar_date_text = date_partition.removeprefix("calendar_date=")

    try:
        calendar_date = date.fromisoformat(calendar_date_text)
    except ValueError as exc:
        raise ValueError(f"Invalid health payload calendar_date partition: {path}") from exc

    payload_type = validate_health_payload_type(path.stem)
    stat = path.stat()

    return GarminHealthSourceFile(
        path=path,
        calendar_date=calendar_date,
        payload_type=payload_type,
        source_file_size_bytes=stat.st_size,
        source_file_modification_time=datetime.fromtimestamp(stat.st_mtime, tz=UTC),
    )


def plan_health_payload_files(
    source_files: list[GarminHealthSourceFile],
    existing_payloads: dict[tuple[date, str], ExistingGarminHealthPayload],
    full_refresh: bool = False,
) -> GarminHealthBronzeIngestionPlan:
    files_to_ingest: list[GarminHealthSourceFile] = []
    changed_keys: list[tuple[date, str]] = []
    skipped_keys: list[tuple[date, str]] = []

    for source_file in source_files:
        existing = existing_payloads.get(source_file.key)

        if full_refresh or existing is None or health_source_file_changed(source_file, existing):
            files_to_ingest.append(source_file)
            changed_keys.append(source_file.key)
        else:
            skipped_keys.append(source_file.key)

    return GarminHealthBronzeIngestionPlan(
        source_files=source_files,
        files_to_ingest=files_to_ingest,
        changed_keys=changed_keys,
        skipped_keys=skipped_keys,
    )


def health_source_file_changed(
    source_file: GarminHealthSourceFile,
    existing_payload: ExistingGarminHealthPayload,
) -> bool:
    if existing_payload.source_file_size_bytes != source_file.source_file_size_bytes:
        return True

    existing_time = normalize_datetime(existing_payload.source_file_modification_time)
    source_time = normalize_datetime(source_file.source_file_modification_time)

    if existing_time is None or source_time is None:
        return True

    return existing_time != source_time


def build_health_bronze_frame(
    source_files: list[GarminHealthSourceFile],
    ingested_at: datetime | None = None,
) -> pd.DataFrame:
    ingested_at = ingested_at or datetime.now(tz=UTC)
    rows = [
        health_bronze_row(source_file, ingested_at=ingested_at)
        for source_file in source_files
    ]
    return align_columns(pd.DataFrame(rows), HEALTH_PAYLOAD_TABLE.columns)


def health_bronze_row(
    source_file: GarminHealthSourceFile,
    ingested_at: datetime,
) -> dict[str, Any]:
    envelope = read_health_payload_envelope(source_file)
    payload = envelope.get("payload")

    return {
        "calendar_date": source_file.calendar_date,
        "payload_type": source_file.payload_type,
        "raw_payload": json.dumps(payload, default=str, sort_keys=True),
        "source_method": envelope.get("source_method"),
        "fetched_at": parse_optional_timestamp(envelope.get("fetched_at")),
        "source_file_path": str(source_file.path),
        "source_file_name": source_file.path.name,
        "source_file_size_bytes": source_file.source_file_size_bytes,
        "source_file_modification_time": source_file.source_file_modification_time,
        "ingested_at": ingested_at,
        "ingestion_date": ingested_at.date(),
        "source_system": str(envelope.get("source_system") or "garmin"),
        "source_format": str(envelope.get("source_format") or "json"),
    }


def read_health_payload_envelope(source_file: GarminHealthSourceFile) -> dict[str, Any]:
    with source_file.path.open("r", encoding="utf-8") as file:
        envelope = json.load(file)

    if not isinstance(envelope, dict):
        raise ValueError(f"Health payload envelope must be a JSON object: {source_file.path}")

    envelope_date = envelope.get("calendar_date")
    if envelope_date is not None and envelope_date != source_file.calendar_date.isoformat():
        raise ValueError(
            f"Health payload calendar_date does not match path for {source_file.path}"
        )

    envelope_payload_type = envelope.get("payload_type")
    if envelope_payload_type is not None and envelope_payload_type != source_file.payload_type:
        raise ValueError(f"Health payload_type does not match path for {source_file.path}")

    return envelope


def parse_optional_timestamp(value: Any) -> datetime | None:
    if value is None:
        return None

    if isinstance(value, datetime):
        return normalize_datetime(value)

    if not isinstance(value, str):
        return None

    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def validate_health_bronze_frame(frame: pd.DataFrame) -> None:
    missing_columns = [
        column for column in HEALTH_PAYLOAD_TABLE.required_columns if column not in frame.columns
    ]
    if missing_columns:
        raise ValueError("health payloads: missing required columns: " + ", ".join(missing_columns))

    for column in HEALTH_PAYLOAD_TABLE.required_columns:
        if frame[column].isna().any():
            raise ValueError(f"health payloads: required column contains nulls: {column}")

    invalid_payload_types = sorted(
        set(frame["payload_type"].dropna().astype(str)) - set(HEALTH_PAYLOAD_TYPES)
    )
    if invalid_payload_types:
        raise ValueError("health payloads: invalid payload_type values: " + ", ".join(invalid_payload_types))

    duplicate_count = int(frame[["calendar_date", "payload_type"]].duplicated().sum())
    if duplicate_count > 0:
        raise ValueError(
            f"health payloads: duplicate calendar_date + payload_type rows: {duplicate_count}"
        )


def read_existing_health_payload_files(
    spark: Any,
    table_name: str,
) -> dict[tuple[date, str], ExistingGarminHealthPayload]:
    rows = (
        spark.table(table_name)
        .select(
            "calendar_date",
            "payload_type",
            "source_file_size_bytes",
            "source_file_modification_time",
        )
        .collect()
    )

    existing_payloads: dict[tuple[date, str], ExistingGarminHealthPayload] = {}

    for row in rows:
        values = row.asDict()
        calendar_date = normalize_date(values["calendar_date"])
        payload_type = str(values["payload_type"])
        existing_payloads[(calendar_date, payload_type)] = ExistingGarminHealthPayload(
            calendar_date=calendar_date,
            payload_type=payload_type,
            source_file_size_bytes=values.get("source_file_size_bytes"),
            source_file_modification_time=normalize_datetime(
                values.get("source_file_modification_time")
            ),
        )

    return existing_payloads


def normalize_date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()

    if isinstance(value, date):
        return value

    return cast(date, pd.Timestamp(value).date())


def delete_existing_health_payloads(
    spark: Any,
    keys: list[tuple[date, str]],
    catalog: str,
    schema: str = BRONZE_SCHEMA,
) -> None:
    if not keys:
        return

    table_name = HEALTH_PAYLOAD_TABLE.full_name(catalog, schema)
    if not table_exists(spark, table_name):
        return

    predicates = [
        "(calendar_date = DATE "
        f"{quote_sql_string(calendar_date.isoformat())} "
        f"AND payload_type = {quote_sql_string(payload_type)})"
        for calendar_date, payload_type in keys
    ]
    spark.sql(f"DELETE FROM {table_name} WHERE {' OR '.join(predicates)}")


def write_health_bronze_table(
    spark: Any,
    frame: pd.DataFrame,
    catalog: str,
    schema: str,
    mode: str,
) -> None:
    spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")

    table_name = HEALTH_PAYLOAD_TABLE.full_name(catalog, schema)
    writer = spark.createDataFrame(frame).write.format("delta").mode(mode)

    if mode == "overwrite":
        writer = writer.option("overwriteSchema", "true")

    writer.partitionBy(HEALTH_PAYLOAD_TABLE.partition_column).saveAsTable(table_name)


def result_to_log_lines(result: GarminHealthBronzeIngestionResult) -> list[str]:
    return [
        f"source_file_count={result.source_file_count}",
        f"ingested_file_count={result.ingested_file_count}",
        f"row_count={result.row_count}",
        f"skipped_payload_count={len(result.skipped_keys)}",
        f"changed_payload_count={len(result.changed_keys)}",
    ]
