from __future__ import annotations

from dataclasses import dataclass

from ingest.garmin.fields import EVENT_FIELDS, RECORD_FIELDS, SESSION_FIELDS


BRONZE_SCHEMA = "bronze"

METADATA_COLUMNS = [
    "garmin_activity_id",
    "source_file_path",
    "source_file_name",
    "source_file_size_bytes",
    "source_file_modification_time",
    "ingested_at",
    "ingestion_date",
    "run_date",
    "source_system",
    "source_format",
]

SESSION_COLUMNS = [
    *SESSION_FIELDS,
    "run_id",
    "start_position_lat_deg",
    "start_position_long_deg",
    "end_position_lat_deg",
    "end_position_long_deg",
    *METADATA_COLUMNS,
]

EVENT_COLUMNS = [
    *EVENT_FIELDS,
    "run_id",
    *METADATA_COLUMNS,
]

RECORD_COLUMNS = [
    *RECORD_FIELDS,
    "run_id",
    "position_lat_deg",
    "position_long_deg",
    *METADATA_COLUMNS,
]

SESSION_REQUIRED_COLUMNS = [
    "run_id",
    "garmin_activity_id",
    "timestamp",
    "start_time",
    "total_distance",
    "run_date",
    "ingested_at",
]

EVENT_REQUIRED_COLUMNS = [
    "run_id",
    "garmin_activity_id",
    "timestamp",
    "event",
    "event_type",
    "run_date",
    "ingested_at",
]

RECORD_REQUIRED_COLUMNS = [
    "run_id",
    "garmin_activity_id",
    "timestamp",
    "run_date",
    "ingested_at",
]


@dataclass(frozen=True)
class BronzeTableSpec:
    entity: str
    table_name: str
    columns: list[str]
    required_columns: list[str]
    partition_column: str = "run_date"

    def full_name(self, catalog: str, schema: str = BRONZE_SCHEMA) -> str:
        return f"{catalog}.{schema}.{self.table_name}"


BRONZE_TABLES = {
    "sessions": BronzeTableSpec(
        entity="sessions",
        table_name="garmin_fit_sessions",
        columns=SESSION_COLUMNS,
        required_columns=SESSION_REQUIRED_COLUMNS,
    ),
    "events": BronzeTableSpec(
        entity="events",
        table_name="garmin_fit_events",
        columns=EVENT_COLUMNS,
        required_columns=EVENT_REQUIRED_COLUMNS,
    ),
    "records": BronzeTableSpec(
        entity="records",
        table_name="garmin_fit_records",
        columns=RECORD_COLUMNS,
        required_columns=RECORD_REQUIRED_COLUMNS,
    ),
}

HEALTH_PAYLOAD_COLUMNS = [
    "calendar_date",
    "payload_type",
    "raw_payload",
    "source_method",
    "fetched_at",
    "source_file_path",
    "source_file_name",
    "source_file_size_bytes",
    "source_file_modification_time",
    "ingested_at",
    "ingestion_date",
    "source_system",
    "source_format",
]

HEALTH_PAYLOAD_REQUIRED_COLUMNS = [
    "calendar_date",
    "payload_type",
    "raw_payload",
    "source_file_path",
    "source_file_name",
    "source_file_size_bytes",
    "source_file_modification_time",
    "ingested_at",
    "ingestion_date",
    "source_system",
    "source_format",
]

HEALTH_PAYLOAD_TABLE = BronzeTableSpec(
    entity="health_payloads",
    table_name="garmin_health_daily_payloads",
    columns=HEALTH_PAYLOAD_COLUMNS,
    required_columns=HEALTH_PAYLOAD_REQUIRED_COLUMNS,
    partition_column="calendar_date",
)
