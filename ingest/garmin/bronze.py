from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pandas as pd

from ingest.garmin.bronze_schema import (
    BRONZE_SCHEMA,
    BRONZE_TABLES,
    DATE_COLUMNS,
    DOUBLE_COLUMNS,
    LONG_COLUMNS,
    TIMESTAMP_COLUMNS,
    BronzeTableSpec,
)
from ingest.garmin.bronze_utils import (
    align_columns,
    normalize_datetime,
    normalize_source_path,
    quote_sql_string,
    table_exists,
)
from ingest.garmin.parser import parse_fit_files
from ingest.garmin.quality import validate_bronze_frames


@dataclass(frozen=True)
class GarminFitSourceFile:
    path: Path
    run_id: str
    source_file_size_bytes: int
    source_file_modification_time: datetime

    @property
    def garmin_activity_id(self) -> str:
        return self.run_id


@dataclass(frozen=True)
class ExistingGarminFitRun:
    run_id: str
    source_file_size_bytes: int | None
    source_file_modification_time: datetime | None


@dataclass(frozen=True)
class GarminBronzeIngestionPlan:
    source_files: list[GarminFitSourceFile]
    files_to_parse: list[GarminFitSourceFile]
    changed_run_ids: list[str]
    skipped_run_ids: list[str]


@dataclass(frozen=True)
class GarminBronzeIngestionResult:
    source_file_count: int
    parsed_file_count: int
    changed_run_ids: list[str]
    skipped_run_ids: list[str]
    session_row_count: int
    event_row_count: int
    record_row_count: int
    warnings: list[str]


def ingest_garmin_fit_bronze(
    spark: Any,
    source_path: str,
    catalog: str,
    schema: str = BRONZE_SCHEMA,
    full_refresh: bool = False,
) -> GarminBronzeIngestionResult:
    source_files = discover_fit_files(source_path)
    sessions_table = BRONZE_TABLES["sessions"].full_name(catalog, schema)
    existing_runs = (
        {}
        if full_refresh or not table_exists(spark, sessions_table)
        else read_existing_run_files(spark, sessions_table)
    )

    plan = plan_fit_files(source_files, existing_runs, full_refresh=full_refresh)

    if not plan.files_to_parse:
        return GarminBronzeIngestionResult(
            source_file_count=len(plan.source_files),
            parsed_file_count=0,
            changed_run_ids=[],
            skipped_run_ids=plan.skipped_run_ids,
            session_row_count=0,
            event_row_count=0,
            record_row_count=0,
            warnings=[],
        )

    parsed_frames = parse_fit_files([source_file.path for source_file in plan.files_to_parse])
    bronze_frames = enrich_bronze_frames(parsed_frames, plan.files_to_parse)
    validation = validate_bronze_frames(bronze_frames)

    if full_refresh:
        overwrite_bronze_tables(spark, bronze_frames, catalog, schema)
    else:
        delete_existing_runs(spark, plan.changed_run_ids, catalog, schema)
        append_bronze_tables(spark, bronze_frames, catalog, schema)

    return GarminBronzeIngestionResult(
        source_file_count=len(plan.source_files),
        parsed_file_count=len(plan.files_to_parse),
        changed_run_ids=plan.changed_run_ids,
        skipped_run_ids=plan.skipped_run_ids,
        session_row_count=len(bronze_frames["sessions"]),
        event_row_count=len(bronze_frames["events"]),
        record_row_count=len(bronze_frames["records"]),
        warnings=validation.warnings,
    )


def discover_fit_files(source_path: str | Path) -> list[GarminFitSourceFile]:
    path = normalize_source_path(source_path)

    if path.is_file():
        paths = [path] if path.suffix.lower() == ".fit" else []
    else:
        paths = sorted(path.glob("*.fit"))

    return [source_file_from_path(item) for item in paths]


def source_file_from_path(path: Path) -> GarminFitSourceFile:
    stat = path.stat()

    return GarminFitSourceFile(
        path=path,
        run_id=path.stem,
        source_file_size_bytes=stat.st_size,
        source_file_modification_time=datetime.fromtimestamp(stat.st_mtime, tz=UTC),
    )


def plan_fit_files(
    source_files: list[GarminFitSourceFile],
    existing_runs: dict[str, ExistingGarminFitRun],
    full_refresh: bool = False,
) -> GarminBronzeIngestionPlan:
    files_to_parse: list[GarminFitSourceFile] = []
    changed_run_ids: list[str] = []
    skipped_run_ids: list[str] = []

    for source_file in source_files:
        existing = existing_runs.get(source_file.run_id)

        if full_refresh or existing is None or source_file_changed(source_file, existing):
            files_to_parse.append(source_file)
            changed_run_ids.append(source_file.run_id)
        else:
            skipped_run_ids.append(source_file.run_id)

    return GarminBronzeIngestionPlan(
        source_files=source_files,
        files_to_parse=files_to_parse,
        changed_run_ids=changed_run_ids,
        skipped_run_ids=skipped_run_ids,
    )


def source_file_changed(
    source_file: GarminFitSourceFile,
    existing_run: ExistingGarminFitRun,
) -> bool:
    if existing_run.source_file_size_bytes != source_file.source_file_size_bytes:
        return True

    existing_time = normalize_datetime(existing_run.source_file_modification_time)
    source_time = normalize_datetime(source_file.source_file_modification_time)

    if existing_time is None or source_time is None:
        return True

    return existing_time != source_time


def enrich_bronze_frames(
    parsed_frames: dict[str, pd.DataFrame],
    source_files: list[GarminFitSourceFile],
    ingested_at: datetime | None = None,
) -> dict[str, pd.DataFrame]:
    ingested_at = ingested_at or datetime.now(tz=UTC)
    metadata = build_source_metadata(source_files, ingested_at)

    sessions = parsed_frames.get("sessions", pd.DataFrame()).copy()
    if sessions.empty or "run_id" not in sessions.columns:
        sessions = align_columns(sessions, BRONZE_TABLES["sessions"].columns)
        run_dates = pd.DataFrame(columns=["run_id", "run_date"])
    else:
        sessions = sessions.merge(metadata, on="run_id", how="left", validate="many_to_one")
        sessions["start_time"] = pd.to_datetime(sessions["start_time"], errors="coerce", utc=True)
        sessions["timestamp"] = pd.to_datetime(sessions["timestamp"], errors="coerce", utc=True)
        sessions["run_date"] = sessions["start_time"].dt.date
        run_dates = sessions[["run_id", "run_date"]].drop_duplicates()

    events = enrich_child_frame(parsed_frames.get("events", pd.DataFrame()), metadata, run_dates)
    records = enrich_child_frame(parsed_frames.get("records", pd.DataFrame()), metadata, run_dates)

    return {
        "sessions": align_columns(sessions, BRONZE_TABLES["sessions"].columns),
        "events": align_columns(events, BRONZE_TABLES["events"].columns),
        "records": align_columns(records, BRONZE_TABLES["records"].columns),
    }


def build_source_metadata(
    source_files: list[GarminFitSourceFile],
    ingested_at: datetime,
) -> pd.DataFrame:
    rows = [
        {
            "run_id": source_file.run_id,
            "garmin_activity_id": source_file.garmin_activity_id,
            "source_file_path": str(source_file.path),
            "source_file_name": source_file.path.name,
            "source_file_size_bytes": source_file.source_file_size_bytes,
            "source_file_modification_time": source_file.source_file_modification_time,
            "ingested_at": ingested_at,
            "ingestion_date": ingested_at.date(),
            "source_system": "garmin",
            "source_format": "fit",
        }
        for source_file in source_files
    ]

    return pd.DataFrame(rows)


def enrich_child_frame(
    frame: pd.DataFrame,
    metadata: pd.DataFrame,
    run_dates: pd.DataFrame,
) -> pd.DataFrame:
    if frame.empty or "run_id" not in frame.columns:
        return frame.copy()

    enriched = frame.copy()
    if "timestamp" in enriched.columns:
        enriched["timestamp"] = pd.to_datetime(enriched["timestamp"], errors="coerce", utc=True)
    enriched = enriched.merge(metadata, on="run_id", how="left", validate="many_to_one")
    return enriched.merge(run_dates, on="run_id", how="left", validate="many_to_one")


def read_existing_run_files(spark: Any, table_name: str) -> dict[str, ExistingGarminFitRun]:
    rows = (
        spark.table(table_name)
        .select("run_id", "source_file_size_bytes", "source_file_modification_time")
        .collect()
    )

    existing_runs: dict[str, ExistingGarminFitRun] = {}

    for row in rows:
        values = row.asDict()
        run_id = str(values["run_id"])
        existing_runs[run_id] = ExistingGarminFitRun(
            run_id=run_id,
            source_file_size_bytes=values.get("source_file_size_bytes"),
            source_file_modification_time=normalize_datetime(
                values.get("source_file_modification_time")
            ),
        )

    return existing_runs


def delete_existing_runs(
    spark: Any,
    run_ids: list[str],
    catalog: str,
    schema: str = BRONZE_SCHEMA,
) -> None:
    if not run_ids:
        return

    quoted_run_ids = ", ".join(quote_sql_string(run_id) for run_id in run_ids)

    for spec in BRONZE_TABLES.values():
        table_name = spec.full_name(catalog, schema)
        if table_exists(spark, table_name):
            spark.sql(f"DELETE FROM {table_name} WHERE run_id IN ({quoted_run_ids})")


def append_bronze_tables(
    spark: Any,
    frames: dict[str, pd.DataFrame],
    catalog: str,
    schema: str = BRONZE_SCHEMA,
) -> None:
    write_bronze_tables(spark, frames, catalog, schema, mode="append")


def overwrite_bronze_tables(
    spark: Any,
    frames: dict[str, pd.DataFrame],
    catalog: str,
    schema: str = BRONZE_SCHEMA,
) -> None:
    write_bronze_tables(spark, frames, catalog, schema, mode="overwrite")


def write_bronze_tables(
    spark: Any,
    frames: dict[str, pd.DataFrame],
    catalog: str,
    schema: str,
    mode: str,
) -> None:
    spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")

    for entity, spec in BRONZE_TABLES.items():
        frame = frames[entity]
        table_name = spec.full_name(catalog, schema)
        spark_schema = bronze_spark_schema(spark, spec, table_name, mode)
        spark_frame = spark.createDataFrame(
            frame_for_spark_schema(frame, spark_schema), spark_schema
        )
        writer = spark_frame.write.format("delta").mode(mode)

        if mode == "overwrite":
            writer = writer.option("overwriteSchema", "true")

        writer.partitionBy(spec.partition_column).saveAsTable(table_name)


def bronze_spark_schema(
    spark: Any,
    spec: BronzeTableSpec,
    table_name: str,
    mode: str,
) -> Any:
    if mode == "append" and table_exists(spark, table_name):
        return spark.table(table_name).schema

    return declared_bronze_spark_schema(spec)


def frame_for_spark_schema(frame: pd.DataFrame, spark_schema: Any) -> pd.DataFrame:
    from pyspark.sql.types import StringType  # type: ignore[import-not-found]

    aligned = align_columns(frame, spark_schema.fieldNames())
    aligned = aligned.astype(object).where(pd.notna(aligned), None)

    string_columns = {
        field.name for field in spark_schema if isinstance(field.dataType, StringType)
    }
    for column in string_columns & set(aligned.columns):
        aligned[column] = aligned[column].apply(_serialize_string_column)

    return aligned


def _serialize_string_column(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, (dict, list)):
        return json.dumps(value, default=str)
    if isinstance(value, (int, float)):
        return str(value)
    return json.dumps(value, default=str)


def declared_bronze_spark_schema(spec: BronzeTableSpec) -> Any:
    from pyspark.sql.types import (
        DateType,
        DoubleType,
        LongType,
        StringType,
        StructField,
        StructType,
        TimestampType,
    )

    timestamp_columns = set(TIMESTAMP_COLUMNS)
    date_columns = set(DATE_COLUMNS)
    long_columns = set(LONG_COLUMNS)
    double_columns = set(DOUBLE_COLUMNS)
    required_columns = set(spec.required_columns)

    fields = []
    for column in spec.columns:
        if column in timestamp_columns:
            data_type = TimestampType()
        elif column in date_columns:
            data_type = DateType()
        elif column in long_columns:
            data_type = LongType()
        elif column in double_columns:
            data_type = DoubleType()
        else:
            data_type = StringType()

        fields.append(StructField(column, data_type, column not in required_columns))

    return StructType(fields)


def result_to_log_lines(result: GarminBronzeIngestionResult) -> list[str]:
    lines = [
        f"source_file_count={result.source_file_count}",
        f"parsed_file_count={result.parsed_file_count}",
        f"session_row_count={result.session_row_count}",
        f"event_row_count={result.event_row_count}",
        f"record_row_count={result.record_row_count}",
        f"skipped_run_count={len(result.skipped_run_ids)}",
        f"changed_run_count={len(result.changed_run_ids)}",
    ]

    for warning in result.warnings:
        lines.append(f"warning={warning}")

    return lines
