#!/usr/bin/env python3

from __future__ import annotations

import argparse
import os
import sys
import time
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Callable, cast

import psycopg
from databricks import sql as databricks_sql
from databricks.sql.client import Connection as DatabricksConnection
from databricks.sql.client import Cursor as DatabricksCursor
from databricks.sql.exc import Error as DatabricksError
from dotenv import load_dotenv
from psycopg import sql as psycopg_sql
from psycopg.types.json import Jsonb


JsonRow = dict[str, object | None]
StatementFactory = Callable[["DatabricksConfig"], str]
LOCAL_SUPABASE_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
DATABRICKS_QUERY_ATTEMPTS = 3
DATABRICKS_QUERY_BATCH_ROWS = 5_000
DATABRICKS_RESULT_BUFFER_BYTES = 8 * 1024 * 1024
DATABRICKS_DOWNLOAD_THREADS = 4
DATABRICKS_REQUEST_TIMEOUT_SECONDS = 120.0
DATABRICKS_POLL_INTERVAL_SECONDS = 1.0
DATABRICKS_STATEMENT_TIMEOUT_SECONDS = 300.0
POSTGRES_LOCK_TIMEOUT = "10s"
POSTGRES_STATEMENT_TIMEOUT = "30min"
PROGRESS_BAR_WIDTH = 20
Fingerprint = dict[str, object]
FINGERPRINT_METADATA_KEY = "export_fingerprints"


@dataclass(frozen=True)
class DatabricksConfig:
    host: str
    token: str
    http_path: str
    catalog: str
    schema: str


@dataclass(frozen=True)
class TableExport:
    table_name: str
    columns: tuple[str, ...]
    statement: StatementFactory


class ExportSchemaError(RuntimeError):
    pass


class IncompleteExportError(RuntimeError):
    pass


def get_project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def load_project_env() -> None:
    load_dotenv(get_project_root() / ".env")


def clean_host(host: str) -> str:
    return host.removeprefix("https://").removeprefix("http://").rstrip("/")


def get_warehouse_id(http_path: str) -> str | None:
    marker = "/warehouses/"

    if marker not in http_path:
        return None

    return http_path.rsplit(marker, maxsplit=1)[1].strip("/") or None


def required_env(name: str) -> str:
    value = os.getenv(name)

    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")

    return value


def get_databricks_config() -> DatabricksConfig:
    http_path = required_env("DATABRICKS_HTTP_PATH")

    if get_warehouse_id(http_path) is None:
        raise RuntimeError("DATABRICKS_HTTP_PATH must point to a SQL warehouse.")

    return DatabricksConfig(
        host=clean_host(required_env("DATABRICKS_HOST")),
        token=required_env("DATABRICKS_TOKEN"),
        http_path=http_path,
        catalog=required_env("DATABRICKS_CATALOG"),
        schema=required_env("DATABRICKS_GOLD_SCHEMA"),
    )


def quote_identifier(value: str) -> str:
    return f"`{value.replace('`', '``')}`"


def gold_table(config: DatabricksConfig, table_name: str) -> str:
    return ".".join(
        [
            quote_identifier(config.catalog),
            quote_identifier(config.schema),
            quote_identifier(table_name),
        ]
    )


def connect_databricks(config: DatabricksConfig) -> DatabricksConnection:
    return databricks_sql.connect(
        server_hostname=config.host,
        http_path=config.http_path,
        access_token=config.token,
        catalog=config.catalog,
        schema=config.schema,
        use_cloud_fetch=True,
        max_download_threads=DATABRICKS_DOWNLOAD_THREADS,
        enable_query_result_lz4_compression=True,
        _socket_timeout=DATABRICKS_REQUEST_TIMEOUT_SECONDS,
        _retry_stop_after_attempts_count=3,
        _retry_stop_after_attempts_duration=300.0,
        _retry_delay_min=1.0,
        _retry_delay_max=10.0,
        _retry_delay_default=1.0,
        _disable_pandas=True,
        query_tags={"application": "running-signals-publisher"},
    )


def execute_databricks(cursor: DatabricksCursor, statement: str) -> None:
    cursor_any = cast(Any, cursor)
    cursor_any.execute_async(statement)
    deadline = time.monotonic() + DATABRICKS_STATEMENT_TIMEOUT_SECONDS

    while bool(cursor_any.is_query_pending()):
        if time.monotonic() >= deadline:
            try:
                cursor.cancel()
            except DatabricksError:
                pass
            raise TimeoutError(
                "Databricks SQL statement timed out after "
                f"{DATABRICKS_STATEMENT_TIMEOUT_SECONDS:.0f} seconds."
            )
        time.sleep(DATABRICKS_POLL_INTERVAL_SECONDS)

    cursor_any.get_async_execution_result()


def cursor_columns(cursor: DatabricksCursor) -> tuple[str, ...]:
    description = cursor.description
    if description is None:
        raise RuntimeError("Databricks SQL statement returned no result schema.")
    return tuple(str(column[0]) for column in description)


def iter_cursor_batches(
    cursor: DatabricksCursor,
    columns: tuple[str, ...],
) -> Iterator[list[JsonRow]]:
    while True:
        fetched = cast(list[Sequence[object | None]], cursor.fetchmany(DATABRICKS_QUERY_BATCH_ROWS))
        if not fetched:
            return
        yield [dict(zip(columns, row, strict=True)) for row in fetched]


@contextmanager
def stream_query_batches(
    config: DatabricksConfig,
    statement: str,
) -> Iterator[tuple[tuple[str, ...], Iterator[list[JsonRow]]]]:
    connection = connect_databricks(config)
    cursor = connection.cursor(
        arraysize=DATABRICKS_QUERY_BATCH_ROWS,
        buffer_size_bytes=DATABRICKS_RESULT_BUFFER_BYTES,
    )
    try:
        execute_databricks(cursor, statement)
        columns = cursor_columns(cursor)
        yield columns, iter_cursor_batches(cursor, columns)
    except BaseException:
        try:
            cursor.cancel()
        except DatabricksError:
            pass
        raise
    finally:
        cursor.close()
        connection.close()


def query_databricks(config: DatabricksConfig, statement: str) -> list[JsonRow]:
    last_error: Exception | None = None
    for attempt in range(1, DATABRICKS_QUERY_ATTEMPTS + 1):
        try:
            with stream_query_batches(config, statement) as (_, batches):
                return [row for batch in batches for row in batch]
        except Exception as exc:
            last_error = exc
            if attempt == DATABRICKS_QUERY_ATTEMPTS:
                break
            time.sleep(float(attempt))

    assert last_error is not None
    raise RuntimeError(
        f"Databricks query failed after {DATABRICKS_QUERY_ATTEMPTS} attempts: "
        f"{last_error}"
    ) from last_error


def run_select(config: DatabricksConfig) -> str:
    return f"""
        select
          run_id,
          activity_id,
          cast(activity_date as string) as activity_date,
          cast(start_time as string) as start_time,
          distance_km,
          duration_seconds,
          avg_pace_min_per_km,
          speed_kmh,
          avg_heart_rate,
          max_heart_rate,
          total_ascent,
          total_descent,
          garmin_recovery_hr,
          route_id,
          route_distance_bucket_km,
          record_distance_coverage_ratio,
          segment_count,
          avg_segment_grade,
          route_altitude_range_m,
          prior_7d_distance_km,
          prior_28d_distance_km
        from {gold_table(config, "mart_run_sessions")}
    """


def dashboard_summary_select(config: DatabricksConfig) -> str:
    return f"""
        with latest as (
          select max(calendar_date) as latest_completed_date
          from {gold_table(config, "mart_days")}
          where is_completed_day = true
        ),

        day_summary as (
          select
            'current' as summary_key,
            cast(latest.latest_completed_date as string) as latest_completed_date,
            sum(days.run_count) as total_runs,
            sum(days.distance_km) as total_distance_km,
            sum(case
              when days.calendar_date >= date_add(latest.latest_completed_date, -6)
              then days.distance_km else 0
            end) as recent_7d_distance_km,
            sum(case
              when days.calendar_date >= date_add(latest.latest_completed_date, -27)
              then days.distance_km else 0
            end) as recent_28d_distance_km
          from {gold_table(config, "mart_days")} as days
          cross join latest
          where days.is_completed_day = true
          group by latest.latest_completed_date
        ),

        active_periods as (
          select
            count(distinct date_trunc('week', calendar_date + interval '1 day') - interval '1 day')
              filter (where run_count > 0) as active_weeks,
            count(distinct date_trunc('month', calendar_date))
              filter (where run_count > 0) as active_months
          from {gold_table(config, "mart_days")}
          where is_completed_day = true
        )

        select
          day_summary.summary_key,
          day_summary.latest_completed_date,
          day_summary.total_runs,
          day_summary.total_distance_km,
          day_summary.recent_7d_distance_km,
          day_summary.recent_28d_distance_km,
          active_periods.active_weeks,
          active_periods.active_months
        from day_summary
        cross join active_periods
    """


EXPORTS: tuple[TableExport, ...] = (
    TableExport(
        table_name="site_dashboard_summary_core",
        columns=(
            "summary_key",
            "latest_completed_date",
            "total_runs",
            "total_distance_km",
            "recent_7d_distance_km",
            "recent_28d_distance_km",
            "active_weeks",
            "active_months",
        ),
        statement=dashboard_summary_select,
    ),
    TableExport(
        table_name="site_runs_core",
        columns=(
            "run_id",
            "activity_id",
            "activity_date",
            "start_time",
            "distance_km",
            "duration_seconds",
            "avg_pace_min_per_km",
            "speed_kmh",
            "avg_heart_rate",
            "max_heart_rate",
            "total_ascent",
            "total_descent",
            "garmin_recovery_hr",
            "route_id",
            "route_distance_bucket_km",
            "record_distance_coverage_ratio",
            "segment_count",
            "avg_segment_grade",
            "route_altitude_range_m",
            "prior_7d_distance_km",
            "prior_28d_distance_km",
        ),
        statement=run_select,
    ),
    TableExport(
        table_name="site_routes",
        columns=(
            "route_id",
            "route_representative_run_id",
            "first_observed_activity_date",
            "latest_observed_activity_date",
            "run_count",
            "avg_distance_km",
            "min_distance_km",
            "max_distance_km",
            "avg_duration_seconds",
            "avg_pace_min_per_km",
            "avg_heart_rate",
            "avg_total_ascent",
            "avg_total_descent",
            "avg_segment_grade",
            "avg_route_altitude_range_m",
            "route_distance_bucket_km",
            "representative_route_centroid_latitude_deg",
            "representative_route_centroid_longitude_deg",
            "city_grid_bucket",
        ),
        statement=lambda config: f"""
            select
              route_id,
              route_representative_run_id,
              cast(first_observed_activity_date as string) as first_observed_activity_date,
              cast(latest_observed_activity_date as string) as latest_observed_activity_date,
              run_count,
              avg_distance_km,
              min_distance_km,
              max_distance_km,
              avg_duration_seconds,
              avg_pace_min_per_km,
              avg_heart_rate,
              avg_total_ascent,
              avg_total_descent,
              avg_segment_grade,
              avg_route_altitude_range_m,
              route_distance_bucket_km,
              representative_route_centroid_latitude_deg,
              representative_route_centroid_longitude_deg,
              city_grid_bucket
            from {gold_table(config, "mart_routes")}
        """,
    ),
    TableExport(
        table_name="site_map_profile_records",
        columns=(
            "run_id",
            "record_index",
            "record_distance_km",
            "altitude_m",
            "position_lat_deg",
            "position_long_deg",
        ),
        statement=lambda config: f"""
            select
              run_id,
              record_index,
              record_distance_km,
              altitude_m,
              position_lat_deg,
              position_long_deg
            from {gold_table(config, "mart_map_profile_records")}
        """,
    ),
    TableExport(
        table_name="site_route_segments",
        columns=(
            "run_id",
            "unit_system",
            "segment_length_value",
            "segment_index",
            "segment_distance_km",
            "segment_duration_seconds",
            "segment_pace_min_per_km",
            "avg_heart_rate",
            "max_heart_rate",
            "avg_running_cadence",
            "elevation_change_m",
            "segment_grade",
            "segment_start_distance_km",
            "segment_end_distance_km",
        ),
        statement=lambda config: f"""
            select
              segments.run_id,
              segments.unit_system,
              segments.segment_length_value,
              segments.segment_index,
              segments.segment_distance_km,
              segments.segment_duration_seconds,
              segments.segment_pace_min_per_km,
              segments.avg_heart_rate,
              segments.max_heart_rate,
              segments.avg_running_cadence,
              segments.elevation_change_m,
              segments.segment_grade,
              segments.segment_start_distance_m / 1000.0 as segment_start_distance_km,
              segments.segment_end_distance_m / 1000.0 as segment_end_distance_km
            from {gold_table(config, "mart_run_segments")} as segments
            order by
              segments.run_id,
              segments.unit_system,
              segments.segment_length_value,
              segments.segment_index
        """,
    ),
    TableExport(
        table_name="site_days_core",
        columns=(
            "calendar_date",
            "run_count",
            "distance_km",
            "duration_seconds",
            "long_run_distance_km",
            "active_day_flag",
            "rolling_7d_distance_km",
            "rolling_28d_distance_km",
        ),
        statement=lambda config: f"""
            select
              cast(calendar_date as string) as calendar_date,
              run_count,
              distance_km,
              duration_seconds,
              long_run_distance_km,
              active_day_flag,
              rolling_7d_distance_km,
              rolling_28d_distance_km
            from {gold_table(config, "mart_days")}
            where is_completed_day = true
        """,
    ),
    TableExport(
        table_name="site_weeks",
        columns=(
            "week_start_date",
            "week_end_date",
            "runs_per_week",
            "weekly_distance_km",
            "avg_run_distance_km",
            "weekly_duration_seconds",
            "avg_pace_min_per_km",
            "long_run_distance_km",
            "long_run_share_of_week",
            "active_days",
            "missed_days",
            "active_week_flag",
            "rolling_4w_distance_km",
            "rolling_12w_distance_km",
            "active_week_streak",
            "missed_weeks_12w",
        ),
        statement=lambda config: f"""
            select
              cast(week_start_date as string) as week_start_date,
              cast(week_end_date as string) as week_end_date,
              runs_per_week,
              weekly_distance_km,
              avg_run_distance_km,
              weekly_duration_seconds,
              avg_pace_min_per_km,
              long_run_distance_km,
              long_run_share_of_week,
              active_days,
              missed_days,
              active_week_flag,
              rolling_4w_distance_km,
              rolling_12w_distance_km,
              active_week_streak,
              missed_weeks_12w
            from {gold_table(config, "mart_weeks")}
        """,
    ),
    TableExport(
        table_name="site_fitness_core",
        columns=(
            "activity_id",
            "activity_date",
            "distance_km",
            "avg_pace_min_per_km",
            "speed_kmh",
            "avg_heart_rate",
            "efficiency_ratio",
            "rolling_4_run_efficiency_ratio",
            "hr_drift_pct",
            "rolling_4_run_hr_drift_pct",
            "rolling_4_run_recovery_hr",
            "rolling_4_week_recovery_hr",
            "hr_band",
            "garmin_recovery_hr",
        ),
        statement=lambda config: f"""
            select
              activity_id,
              cast(activity_date as string) as activity_date,
              distance_km,
              avg_pace_min_per_km,
              speed_kmh,
              avg_heart_rate,
              efficiency_ratio,
              rolling_4_run_efficiency_ratio,
              hr_drift_pct,
              rolling_4_run_hr_drift_pct,
              rolling_4_run_recovery_hr,
              rolling_4_week_recovery_hr,
              hr_band,
              garmin_recovery_hr
            from {gold_table(config, "signal_fitness")}
        """,
    ),
)

PUBLIC_TABLE_NAMES = {
    "site_dashboard_summary_core": "site_dashboard_summary",
    "site_runs_core": "site_runs",
    "site_days_core": "site_days",
    "site_fitness_core": "site_fitness",
}


def metadata_table_name(table_name: str) -> str:
    return PUBLIC_TABLE_NAMES.get(table_name, table_name)


def fingerprint_statement(statement: str) -> str:
    """Wrap an export query in an order-independent content fingerprint.

    dbt rebuilds gold tables with ``create or replace table`` on every run, so
    Delta versions cannot detect unchanged outputs. A row count plus a decimal
    sum of whole-row hashes changes exactly when the exported content changes.
    """
    return f"""
        select
          count(*) as row_count,
          cast(sum(cast(xxhash64(*) as decimal(38, 0))) as string) as hash_sum
        from ({statement}) as export_rows
    """


def combined_fingerprint_statement(config: DatabricksConfig) -> str:
    statements = []
    for table_export in EXPORTS:
        table_name = table_export.table_name.replace("'", "''")
        statements.append(
            f"""
            select
              '{table_name}' as table_name,
              count(*) as row_count,
              cast(sum(cast(xxhash64(*) as decimal(38, 0))) as string) as hash_sum
            from ({table_export.statement(config)}) as export_rows
            """
        )
    return "\nunion all\n".join(statements)


def fetch_fingerprints(
    config: DatabricksConfig,
    progress: "ProgressReporter",
) -> dict[str, Fingerprint | None]:
    """Compute the current content fingerprint of every export table.

    Tables whose fingerprint query fails return ``None``, which forces them to
    sync instead of risking a stale skip.
    """
    progress.status(f"[fingerprint] computing {len(EXPORTS)} table fingerprints ...")
    started = time.monotonic()
    try:
        rows = query_databricks(config, combined_fingerprint_statement(config))
    except RuntimeError as exc:
        progress.info(
            f"Fingerprints failed ({exc}); all tables will sync unconditionally"
        )
        return {table_export.table_name: None for table_export in EXPORTS}

    by_name = {str(row.get("table_name")): row for row in rows}
    fingerprints: dict[str, Fingerprint | None] = {}
    for table_export in EXPORTS:
        row = by_name.get(table_export.table_name)
        if row is None:
            fingerprints[table_export.table_name] = None
            continue
        hash_sum = row.get("hash_sum")
        fingerprints[table_export.table_name] = {
            "row_count": int(cast(Any, row.get("row_count"))),
            "hash_sum": None if hash_sum is None else str(hash_sum),
        }

    elapsed = time.monotonic() - started
    progress.info(f"Fingerprinted {len(EXPORTS)} tables in {elapsed:.1f}s.")
    return fingerprints


def plan_sync(
    fingerprints: dict[str, Fingerprint | None],
    stored: dict[str, Any],
    force_full: bool,
) -> list[TableExport]:
    """Select the exports whose content changed since the last successful sync."""
    changed: list[TableExport] = []

    for table_export in EXPORTS:
        fingerprint = fingerprints.get(table_export.table_name)
        if (
            force_full
            or fingerprint is None
            or stored.get(metadata_table_name(table_export.table_name)) != fingerprint
        ):
            changed.append(table_export)

    return changed


def truncate_table(connection: psycopg.Connection[Any], table_name: str) -> None:
    query = psycopg_sql.SQL("truncate {} restart identity").format(
        psycopg_sql.Identifier("public", table_name)
    )
    with connection.cursor() as cursor:
        cursor.execute(query)


def staging_table_name(table_name: str) -> str:
    return f"running_signals_stage_{table_name}"


def create_staging_table(
    connection: psycopg.Connection[Any],
    table_export: TableExport,
) -> str:
    stage_name = staging_table_name(table_export.table_name)
    query = psycopg_sql.SQL(
        "create temp table if not exists {} "
        "(like {} including defaults) on commit preserve rows"
    ).format(
        psycopg_sql.Identifier(stage_name),
        psycopg_sql.Identifier("public", table_export.table_name),
    )
    with connection.cursor() as cursor:
        cursor.execute(query)
    return stage_name


def clear_staging_table(connection: psycopg.Connection[Any], stage_name: str) -> None:
    with connection.cursor() as cursor:
        cursor.execute(
            psycopg_sql.SQL("truncate {}").format(psycopg_sql.Identifier(stage_name))
        )


def copy_rows(
    connection: psycopg.Connection[Any],
    table_export: TableExport,
    batches: Iterator[list[JsonRow]],
    on_rows: Callable[[int], None] | None = None,
    destination_table: str | None = None,
) -> int:
    """Bulk-load streamed batches with COPY instead of row-by-row inserts."""
    destination = (
        psycopg_sql.Identifier(destination_table)
        if destination_table is not None
        else psycopg_sql.Identifier("public", table_export.table_name)
    )
    copy_statement = psycopg_sql.SQL("copy {} ({}) from stdin").format(
        destination,
        psycopg_sql.SQL(", ").join(
            psycopg_sql.Identifier(column) for column in table_export.columns
        ),
    )
    loaded = 0

    with connection.cursor() as cursor:
        with cursor.copy(copy_statement) as copy:
            for batch in batches:
                for row in batch:
                    copy.write_row(
                        [row.get(column) for column in table_export.columns]
                    )
                loaded += len(batch)
                if on_rows is not None:
                    on_rows(loaded)

    return loaded


def replace_from_staging(
    connection: psycopg.Connection[Any],
    table_export: TableExport,
    stage_name: str,
) -> None:
    columns = psycopg_sql.SQL(", ").join(
        psycopg_sql.Identifier(column) for column in table_export.columns
    )
    with connection.cursor() as cursor:
        cursor.execute(
            psycopg_sql.SQL("truncate {} restart identity").format(
                psycopg_sql.Identifier("public", table_export.table_name)
            )
        )
        cursor.execute(
            psycopg_sql.SQL("insert into {} ({}) select {} from {}").format(
                psycopg_sql.Identifier("public", table_export.table_name),
                columns,
                columns,
                psycopg_sql.Identifier(stage_name),
            )
        )


def get_metadata_value(connection: psycopg.Connection[Any], key: str) -> Any:
    with connection.cursor() as cursor:
        cursor.execute(
            "select metadata_value from public.site_metadata where metadata_key = %s",
            (key,),
        )
        row = cursor.fetchone()
    return row[0] if row else None


def upsert_metadata(
    connection: psycopg.Connection[Any],
    key: str,
    value: object,
) -> None:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            insert into public.site_metadata (metadata_key, metadata_value, updated_at)
            values (%s, %s, now())
            on conflict (metadata_key) do update
            set metadata_value = excluded.metadata_value,
                updated_at = excluded.updated_at
            """,
            (key, Jsonb(value)),
        )


def render_progress(loaded: int, total: int | None) -> str:
    if total is None or total <= 0:
        return f"{loaded:,} rows"
    fraction = min(loaded / total, 1.0)
    filled = round(PROGRESS_BAR_WIDTH * fraction)
    bar = "#" * filled + "-" * (PROGRESS_BAR_WIDTH - filled)
    return f"|{bar}| {fraction:>3.0%} {loaded:,}/{total:,} rows"


class ProgressReporter:
    """Single-line status display on TTYs, plain log lines otherwise."""

    def __init__(self, use_tty: bool) -> None:
        self.use_tty = use_tty

    def info(self, message: str) -> None:
        if self.use_tty:
            sys.stdout.write("\r\x1b[K" + message + "\n")
            sys.stdout.flush()
        else:
            print(message, flush=True)

    def status(self, message: str) -> None:
        if self.use_tty:
            sys.stdout.write("\r\x1b[K" + message)
            sys.stdout.flush()


def acquire_publish_lock(
    connection: psycopg.Connection[Any],
) -> None:
    row = connection.execute(
        "select pg_try_advisory_lock(hashtext(%s))",
        ("running-signals-publish-fit",),
    ).fetchone()
    if row is None or row[0] is not True:
        raise RuntimeError("Another FIT Supabase publisher is already running.")


def release_publish_lock(
    connection: psycopg.Connection[Any],
) -> None:
    connection.execute(
        "select pg_advisory_unlock(hashtext(%s))",
        ("running-signals-publish-fit",),
    )


def stage_export(
    connection: psycopg.Connection[Any],
    config: DatabricksConfig,
    table_export: TableExport,
    expected_rows: int | None,
    progress: ProgressReporter,
    index: int,
    changed_count: int,
) -> tuple[str, int]:
    stage_name = create_staging_table(connection, table_export)
    last_error: Exception | None = None

    for attempt in range(1, DATABRICKS_QUERY_ATTEMPTS + 1):
        clear_staging_table(connection, stage_name)
        started = time.monotonic()
        progress.info(
            f"[{index}/{changed_count}] {table_export.table_name}: staging "
            f"(attempt {attempt}/{DATABRICKS_QUERY_ATTEMPTS})"
        )

        try:
            with stream_query_batches(
                config,
                table_export.statement(config),
            ) as (columns, batches):
                if columns != table_export.columns:
                    raise ExportSchemaError(
                        f"{table_export.table_name}: expected columns "
                        f"{table_export.columns!r}, received {columns!r}"
                    )

                def report_rows(count: int) -> None:
                    progress.status(
                        f"[{index}/{changed_count}] {table_export.table_name} "
                        + render_progress(count, expected_rows)
                    )

                loaded = copy_rows(
                    connection,
                    table_export,
                    batches,
                    report_rows,
                    destination_table=stage_name,
                )

            if expected_rows is not None and loaded != expected_rows:
                raise IncompleteExportError(
                    f"{table_export.table_name}: expected {expected_rows:,} rows, "
                    f"staged {loaded:,}"
                )

            elapsed = time.monotonic() - started
            progress.info(
                f"[{index}/{changed_count}] {table_export.table_name}: "
                f"staged {loaded:,} rows in {elapsed:.1f}s"
            )
            return stage_name, loaded
        except (psycopg.Error, ExportSchemaError):
            raise
        except Exception as exc:
            last_error = exc
            if attempt == DATABRICKS_QUERY_ATTEMPTS:
                break
            progress.info(
                f"{table_export.table_name}: staging failed ({exc}); "
                "retrying with a fresh Databricks query"
            )
            time.sleep(float(attempt))

    assert last_error is not None
    raise RuntimeError(
        f"{table_export.table_name}: staging failed after "
        f"{DATABRICKS_QUERY_ATTEMPTS} attempts: {last_error}"
    ) from last_error


def sync_supabase(
    supabase_db_url: str,
    config: DatabricksConfig,
    fingerprints: dict[str, Fingerprint | None],
    force_full: bool,
    dry_run: bool,
    progress: ProgressReporter,
) -> None:
    changed: list[TableExport] = []

    with psycopg.connect(supabase_db_url, autocommit=True) as connection:
        connection.execute(
            "select set_config('statement_timeout', %s, false)",
            (POSTGRES_STATEMENT_TIMEOUT,),
        )
        acquire_publish_lock(connection)
        try:
            stored_raw = get_metadata_value(connection, FINGERPRINT_METADATA_KEY)
            stored = stored_raw if isinstance(stored_raw, dict) else {}
            changed = plan_sync(
                fingerprints,
                cast(dict[str, Any], stored),
                force_full,
            )

            for table_export in EXPORTS:
                if table_export in changed:
                    progress.info(f"{table_export.table_name}: will sync")
                else:
                    progress.info(f"{table_export.table_name}: unchanged, skipping")

            if dry_run:
                progress.info("Dry run complete; Supabase was not modified.")
                return

            synced_counts: dict[str, int] = {}
            staged_tables: dict[str, str] = {}
            for index, table_export in enumerate(changed, start=1):
                fingerprint = fingerprints.get(table_export.table_name)
                expected_rows = (
                    cast(int, fingerprint["row_count"])
                    if fingerprint is not None
                    else None
                )
                stage_name, loaded = stage_export(
                    connection,
                    config,
                    table_export,
                    expected_rows,
                    progress,
                    index,
                    len(changed),
                )
                staged_tables[table_export.table_name] = stage_name
                synced_counts[table_export.table_name] = loaded

            summary_rows = query_databricks(config, dashboard_summary_select(config))
            latest_summary = summary_rows[0] if summary_rows else {}
            generated_at = datetime.now(UTC).isoformat()

            export_names = {
                metadata_table_name(table_export.table_name) for table_export in EXPORTS
            }
            merged_fingerprints: dict[str, Any] = {
                name: value for name, value in stored.items() if name in export_names
            }
            changed_names = {table_export.table_name for table_export in changed}
            row_counts: dict[str, int] = {}
            for table_export in sorted(EXPORTS, key=lambda item: item.table_name):
                name = table_export.table_name
                metadata_name = metadata_table_name(name)
                fingerprint = fingerprints.get(name)
                if name in synced_counts:
                    row_counts[metadata_name] = synced_counts[name]
                elif fingerprint is not None:
                    row_counts[metadata_name] = cast(int, fingerprint["row_count"])
                else:
                    row_counts[metadata_name] = 0
                if name in changed_names:
                    if fingerprint is not None:
                        merged_fingerprints[metadata_name] = fingerprint
                    else:
                        merged_fingerprints.pop(metadata_name, None)

            commit_started = time.monotonic()
            with connection.transaction():
                connection.execute(
                    "select set_config('lock_timeout', %s, true)",
                    (POSTGRES_LOCK_TIMEOUT,),
                )
                for table_export in changed:
                    replace_from_staging(
                        connection,
                        table_export,
                        staged_tables[table_export.table_name],
                    )

                upsert_metadata(connection, "generated_at", generated_at)
                upsert_metadata(
                    connection,
                    "latest_completed_date",
                    latest_summary.get("latest_completed_date"),
                )
                upsert_metadata(connection, "databricks_catalog", config.catalog)
                upsert_metadata(connection, "databricks_gold_schema", config.schema)
                upsert_metadata(connection, "row_counts", row_counts)
                upsert_metadata(connection, FINGERPRINT_METADATA_KEY, merged_fingerprints)

            progress.info(
                f"Committed {len(changed)} tables in "
                f"{time.monotonic() - commit_started:.1f}s."
            )
        finally:
            release_publish_lock(connection)

    skipped_count = len(EXPORTS) - len(changed)
    progress.info(
        f"Supabase site read models reloaded: {len(changed)} synced, "
        f"{skipped_count} unchanged."
    )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    load_project_env()

    parser = argparse.ArgumentParser(
        description="Reload Supabase site read models from Databricks gold tables."
    )
    parser.add_argument(
        "--supabase-db-url",
        default=os.getenv("SUPABASE_DB_URL", LOCAL_SUPABASE_DB_URL),
        help=(
            "Supabase Postgres connection string. Defaults to SUPABASE_DB_URL, "
            "then the local Supabase CLI database."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fingerprint Databricks tables and report what would sync without writing.",
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="Force a full reload of every table, ignoring stored fingerprints.",
    )
    parser.add_argument(
        "--no-progress",
        action="store_true",
        help="Disable the interactive progress display (plain log lines).",
    )

    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    config = get_databricks_config()
    progress = ProgressReporter(
        use_tty=not args.no_progress and sys.stdout.isatty()
    )
    fingerprints = fetch_fingerprints(config, progress)
    sync_supabase(
        args.supabase_db_url,
        config,
        fingerprints,
        force_full=args.full,
        dry_run=args.dry_run,
        progress=progress,
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1)
