#!/usr/bin/env python3

from __future__ import annotations

import argparse
import http.client
import json
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Callable, cast

import psycopg
from dotenv import load_dotenv
from psycopg.types.json import Jsonb


JsonRow = dict[str, object | None]
StatementFactory = Callable[["DatabricksConfig"], str]
LOCAL_SUPABASE_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
DATABRICKS_REQUEST_ATTEMPTS = 3
DATABRICKS_REQUEST_BACKOFF_SECONDS = 1.0


@dataclass(frozen=True)
class DatabricksConfig:
    host: str
    token: str
    warehouse_id: str
    catalog: str
    schema: str


@dataclass(frozen=True)
class TableExport:
    table_name: str
    columns: tuple[str, ...]
    statement: StatementFactory


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
    warehouse_id = get_warehouse_id(http_path)

    if warehouse_id is None:
        raise RuntimeError("DATABRICKS_HTTP_PATH must point to a SQL warehouse.")

    return DatabricksConfig(
        host=clean_host(required_env("DATABRICKS_HOST")),
        token=required_env("DATABRICKS_TOKEN"),
        warehouse_id=warehouse_id,
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


def databricks_request(
    config: DatabricksConfig,
    method: str,
    url: str,
    payload: dict[str, object] | None = None,
) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={
            "Authorization": f"Bearer {config.token}",
            "Content-Type": "application/json",
        },
    )
    last_error: BaseException | None = None

    for attempt in range(1, DATABRICKS_REQUEST_ATTEMPTS + 1):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                response_body = response.read().decode("utf-8")
                return cast(dict[str, Any], json.loads(response_body))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(
                f"Databricks request failed with HTTP {exc.code}: {detail}"
            ) from exc
        except (
            http.client.IncompleteRead,
            json.JSONDecodeError,
            TimeoutError,
            urllib.error.URLError,
        ) as exc:
            last_error = exc
            if attempt == DATABRICKS_REQUEST_ATTEMPTS:
                break

            time.sleep(DATABRICKS_REQUEST_BACKOFF_SECONDS * attempt)

    assert last_error is not None
    raise RuntimeError(
        "Databricks request failed after "
        f"{DATABRICKS_REQUEST_ATTEMPTS} attempts: {last_error}"
    ) from last_error


def submit_statement(config: DatabricksConfig, statement: str) -> dict[str, Any]:
    return databricks_request(
        config,
        "POST",
        f"https://{config.host}/api/2.0/sql/statements",
        {
            "statement": statement,
            "warehouse_id": config.warehouse_id,
            "catalog": config.catalog,
            "schema": config.schema,
            "wait_timeout": "10s",
            "disposition": "INLINE",
            "format": "JSON_ARRAY",
        },
    )


def poll_statement(config: DatabricksConfig, statement_id: str) -> dict[str, Any]:
    for _ in range(20):
        response = databricks_request(
            config,
            "GET",
            f"https://{config.host}/api/2.0/sql/statements/{statement_id}",
        )
        state = response.get("status", {}).get("state")

        if state in {"SUCCEEDED", "FAILED", "CANCELED"}:
            return response

        time.sleep(1)

    raise RuntimeError("Databricks SQL statement timed out.")


def rows_from_statement(response: dict[str, Any]) -> list[JsonRow]:
    columns = [
        str(column["name"])
        for column in response.get("manifest", {})
        .get("schema", {})
        .get("columns", [])
    ]
    rows = response.get("result", {}).get("data_array", [])
    result: list[JsonRow] = []

    for row in rows:
        if not isinstance(row, list):
            continue

        result.append(
            {
                column: row[index] if index < len(row) else None
                for index, column in enumerate(columns)
            }
        )

    return result


def query_databricks(config: DatabricksConfig, statement: str) -> list[JsonRow]:
    submitted = submit_statement(config, statement)
    state = submitted.get("status", {}).get("state")
    final_response = (
        poll_statement(config, str(submitted.get("statement_id", "")))
        if state in {"PENDING", "RUNNING"}
        else submitted
    )

    if final_response.get("status", {}).get("state") != "SUCCEEDED":
        error = final_response.get("status", {}).get("error", {})
        message = error.get("message") or "Databricks SQL statement failed."
        raise RuntimeError(str(message))

    return rows_from_statement(final_response)


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
          resting_heart_rate,
          hrv_value,
          hrv_status,
          sleep_score,
          sleep_duration_seconds,
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
            end) as recent_28d_distance_km,
            sum(case when days.has_hrv_payload then 1 else 0 end) as hrv_days,
            sum(case when days.has_rhr_payload then 1 else 0 end) as rhr_days,
            sum(case when days.has_sleep_payload then 1 else 0 end) as sleep_days,
            sum(case when days.has_heart_rates_payload then 1 else 0 end) as heart_rate_days
          from {gold_table(config, "mart_days")} as days
          cross join latest
          where days.is_completed_day = true
          group by latest.latest_completed_date
        ),

        active_weeks as (
          select count(*) as active_weeks
          from {gold_table(config, "mart_weeks")}
          where active_week_flag = true
        ),

        active_months as (
          select count(*) as active_months
          from {gold_table(config, "mart_months")}
          where runs_per_month > 0
        )

        select
          day_summary.summary_key,
          day_summary.latest_completed_date,
          day_summary.total_runs,
          day_summary.total_distance_km,
          day_summary.recent_7d_distance_km,
          day_summary.recent_28d_distance_km,
          active_weeks.active_weeks,
          active_months.active_months,
          day_summary.hrv_days,
          day_summary.rhr_days,
          day_summary.sleep_days,
          day_summary.heart_rate_days
        from day_summary
        cross join active_weeks
        cross join active_months
    """


EXPORTS: tuple[TableExport, ...] = (
    TableExport(
        table_name="site_dashboard_summary",
        columns=(
            "summary_key",
            "latest_completed_date",
            "total_runs",
            "total_distance_km",
            "recent_7d_distance_km",
            "recent_28d_distance_km",
            "active_weeks",
            "active_months",
            "hrv_days",
            "rhr_days",
            "sleep_days",
            "heart_rate_days",
        ),
        statement=dashboard_summary_select,
    ),
    TableExport(
        table_name="site_runs",
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
            "resting_heart_rate",
            "hrv_value",
            "hrv_status",
            "sleep_score",
            "sleep_duration_seconds",
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
            "min_route_match_similarity",
            "avg_route_match_similarity",
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
            "route_h3_signature",
        ),
        statement=lambda config: f"""
            select
              route_id,
              route_representative_run_id,
              cast(first_observed_activity_date as string) as first_observed_activity_date,
              cast(latest_observed_activity_date as string) as latest_observed_activity_date,
              run_count,
              min_route_match_similarity,
              avg_route_match_similarity,
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
              route_h3_signature
            from {gold_table(config, "mart_routes")}
        """,
    ),
    TableExport(
        table_name="site_route_segments",
        columns=(
            "run_id",
            "route_id",
            "activity_date",
            "segment_index",
            "segment_distance_km",
            "segment_duration_seconds",
            "segment_pace_min_per_km",
            "avg_speed_kmh",
            "avg_heart_rate",
            "max_heart_rate",
            "avg_running_cadence",
            "min_altitude_m",
            "max_altitude_m",
            "elevation_change_m",
            "segment_grade",
            "segment_start_distance_km",
            "segment_end_distance_km",
            "segment_start_latitude_deg",
            "segment_start_longitude_deg",
            "segment_end_latitude_deg",
            "segment_end_longitude_deg",
        ),
        statement=lambda config: f"""
            select
              segments.run_id,
              sessions.route_id,
              cast(segments.activity_date as string) as activity_date,
              segments.segment_index,
              segments.segment_distance_km,
              segments.segment_duration_seconds,
              segments.segment_pace_min_per_km,
              segments.avg_speed_kmh,
              segments.avg_heart_rate,
              segments.max_heart_rate,
              segments.avg_running_cadence,
              segments.min_altitude_m,
              segments.max_altitude_m,
              segments.elevation_change_m,
              segments.segment_grade,
              segments.segment_start_distance_m / 1000.0 as segment_start_distance_km,
              segments.segment_end_distance_m / 1000.0 as segment_end_distance_km,
              segments.segment_start_latitude_deg,
              segments.segment_start_longitude_deg,
              segments.segment_end_latitude_deg,
              segments.segment_end_longitude_deg
            from {gold_table(config, "mart_run_segments")} as segments
            inner join {gold_table(config, "mart_run_sessions")} as sessions
              on segments.run_id = sessions.run_id
        """,
    ),
    TableExport(
        table_name="site_days",
        columns=(
            "calendar_date",
            "run_count",
            "distance_km",
            "duration_seconds",
            "long_run_distance_km",
            "active_day_flag",
            "rolling_7d_distance_km",
            "rolling_28d_distance_km",
            "resting_heart_rate",
            "hrv_value",
            "sleep_score",
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
              rolling_28d_distance_km,
              resting_heart_rate,
              hrv_value,
              sleep_score
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
        table_name="site_months",
        columns=(
            "month_start_date",
            "calendar_year",
            "calendar_month",
            "runs_per_month",
            "monthly_distance_km",
            "monthly_duration_seconds",
            "long_run_distance_km",
            "active_days",
        ),
        statement=lambda config: f"""
            select
              cast(month_start_date as string) as month_start_date,
              calendar_year,
              calendar_month,
              runs_per_month,
              monthly_distance_km,
              monthly_duration_seconds,
              long_run_distance_km,
              active_days
            from {gold_table(config, "mart_months")}
        """,
    ),
    TableExport(
        table_name="site_years",
        columns=(
            "year_start_date",
            "calendar_year",
            "runs_per_year",
            "yearly_distance_km",
            "yearly_duration_seconds",
            "long_run_distance_km",
            "active_days",
        ),
        statement=lambda config: f"""
            select
              cast(year_start_date as string) as year_start_date,
              calendar_year,
              runs_per_year,
              yearly_distance_km,
              yearly_duration_seconds,
              long_run_distance_km,
              active_days
            from {gold_table(config, "mart_years")}
        """,
    ),
    TableExport(
        table_name="site_fitness",
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
            "hr_band",
            "garmin_recovery_hr",
            "resting_heart_rate",
            "hrv_value",
            "hrv_status",
            "sleep_score",
            "sleep_duration_seconds",
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
              hr_band,
              garmin_recovery_hr,
              resting_heart_rate,
              hrv_value,
              hrv_status,
              sleep_score,
              sleep_duration_seconds
            from {gold_table(config, "signal_fitness")}
        """,
    ),
)


def fetch_exports(config: DatabricksConfig) -> dict[str, list[JsonRow]]:
    exported: dict[str, list[JsonRow]] = {}

    for table_export in EXPORTS:
        rows = query_databricks(config, table_export.statement(config))
        exported[table_export.table_name] = rows
        print(f"{table_export.table_name}: fetched {len(rows)} rows")

    return exported


def insert_rows(
    connection: psycopg.Connection[Any],
    table_export: TableExport,
    rows: list[JsonRow],
) -> None:
    if not rows:
        return

    columns = ", ".join(table_export.columns)
    placeholders = ", ".join(f"%({column})s" for column in table_export.columns)
    sql = f"insert into public.{table_export.table_name} ({columns}) values ({placeholders})"

    with connection.cursor() as cursor:
        cursor.executemany(sql, rows)


def insert_metadata(
    connection: psycopg.Connection[Any],
    key: str,
    value: object,
) -> None:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            insert into public.site_metadata (metadata_key, metadata_value, updated_at)
            values (%s, %s, now())
            """,
            (key, Jsonb(value)),
        )


def reload_supabase(
    supabase_db_url: str,
    config: DatabricksConfig,
    exported: dict[str, list[JsonRow]],
) -> None:
    table_names = [table_export.table_name for table_export in EXPORTS] + ["site_metadata"]
    latest_summary = (exported.get("site_dashboard_summary") or [{}])[0]
    generated_at = datetime.now(UTC).isoformat()

    with psycopg.connect(supabase_db_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "truncate "
                + ", ".join(f"public.{table_name}" for table_name in table_names)
                + " restart identity"
            )

        for table_export in EXPORTS:
            insert_rows(connection, table_export, exported[table_export.table_name])
            print(
                f"{table_export.table_name}: loaded "
                f"{len(exported[table_export.table_name])} rows"
            )

        row_counts = {
            table_name: len(rows)
            for table_name, rows in sorted(exported.items(), key=lambda item: item[0])
        }
        insert_metadata(connection, "generated_at", generated_at)
        insert_metadata(connection, "latest_completed_date", latest_summary.get("latest_completed_date"))
        insert_metadata(connection, "databricks_catalog", config.catalog)
        insert_metadata(connection, "databricks_gold_schema", config.schema)
        insert_metadata(connection, "row_counts", row_counts)

    print("Supabase site read models reloaded.")


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
        help="Fetch Databricks rows and print counts without writing to Supabase.",
    )

    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    config = get_databricks_config()
    exported = fetch_exports(config)

    if args.dry_run:
        print("Dry run complete; Supabase was not modified.")
        return 0

    reload_supabase(args.supabase_db_url, config, exported)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1)
