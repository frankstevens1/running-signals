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
from psycopg import sql as psycopg_sql
from psycopg.types.json import Jsonb


JsonRow = dict[str, object | None]
StatementFactory = Callable[["DatabricksConfig"], str]
LOCAL_SUPABASE_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
DATABRICKS_REQUEST_ATTEMPTS = 3
DATABRICKS_EXTERNAL_DOWNLOAD_ATTEMPTS = 8
DATABRICKS_REQUEST_BACKOFF_SECONDS = 1.0
DATABRICKS_REQUEST_TIMEOUT_SECONDS = 120
DATABRICKS_EXTERNAL_READ_SIZE_BYTES = 1024 * 1024
DATABRICKS_POLL_INTERVAL_SECONDS = 1.0
DATABRICKS_STATEMENT_TIMEOUT_SECONDS = 300.0
DATABRICKS_TERMINAL_STATES = frozenset({"SUCCEEDED", "FAILED", "CANCELED", "CLOSED"})
DATABRICKS_RETRYABLE_HTTP_STATUS_CODES = frozenset({429, 500, 502, 503, 504})


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


def retry_delay_seconds(attempt: int, retry_after: str | None = None) -> float:
    if retry_after:
        try:
            return max(float(retry_after), 0.0)
        except ValueError:
            pass

    return DATABRICKS_REQUEST_BACKOFF_SECONDS * attempt


def decode_json_payload(payload: bytes, source: str) -> object:
    try:
        return json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"{source} returned invalid JSON.") from exc


def databricks_request(
    config: DatabricksConfig,
    method: str,
    url: str,
    payload: dict[str, object] | None = None,
) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    last_error: BaseException | None = None

    for attempt in range(1, DATABRICKS_REQUEST_ATTEMPTS + 1):
        request = urllib.request.Request(
            url,
            data=body,
            method=method,
            headers={
                "Authorization": f"Bearer {config.token}",
                "Accept": "application/json",
                **({"Content-Type": "application/json"} if body is not None else {}),
            },
        )

        try:
            with urllib.request.urlopen(
                request,
                timeout=DATABRICKS_REQUEST_TIMEOUT_SECONDS,
            ) as response:
                parsed = decode_json_payload(
                    response.read(),
                    "Databricks API",
                )

                if not isinstance(parsed, dict):
                    raise RuntimeError("Databricks API returned a non-object response.")

                return cast(dict[str, Any], parsed)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")

            if (
                exc.code in DATABRICKS_RETRYABLE_HTTP_STATUS_CODES
                and attempt < DATABRICKS_REQUEST_ATTEMPTS
            ):
                last_error = exc
                time.sleep(
                    retry_delay_seconds(attempt, exc.headers.get("Retry-After"))
                )
                continue

            raise RuntimeError(
                f"Databricks request failed with HTTP {exc.code}: {detail}"
            ) from exc
        except (
            http.client.IncompleteRead,
            TimeoutError,
            urllib.error.URLError,
        ) as exc:
            last_error = exc

            if attempt == DATABRICKS_REQUEST_ATTEMPTS:
                break

            time.sleep(retry_delay_seconds(attempt))

    assert last_error is not None
    raise RuntimeError(
        "Databricks request failed after "
        f"{DATABRICKS_REQUEST_ATTEMPTS} attempts: {last_error}"
    ) from last_error


def parse_content_range(value: str | None) -> tuple[int, int, int | None] | None:
    """Parse an HTTP Content-Range header such as ``bytes 10-19/100``."""
    if not value or not value.startswith("bytes "):
        return None

    try:
        byte_range, total = value.removeprefix("bytes ").split("/", maxsplit=1)
        start, end = byte_range.split("-", maxsplit=1)
        return int(start), int(end), None if total == "*" else int(total)
    except (TypeError, ValueError):
        return None


def external_json_request(url: str) -> object:
    """
    Download a signed Databricks result URL without forwarding credentials.

    External result files can be tens of megabytes. If the storage connection
    closes early, retain the bytes already received and resume with an HTTP
    Range request instead of restarting the entire file from byte zero.
    """
    downloaded = bytearray()
    expected_total_bytes: int | None = None
    etag: str | None = None
    last_error: BaseException | None = None

    for attempt in range(1, DATABRICKS_EXTERNAL_DOWNLOAD_ATTEMPTS + 1):
        offset = len(downloaded)
        headers = {
            "Accept": "application/json",
            # Range offsets must apply to the exact bytes being accumulated.
            "Accept-Encoding": "identity",
        }

        if offset > 0:
            headers["Range"] = f"bytes={offset}-"
            if etag:
                headers["If-Range"] = etag

        request = urllib.request.Request(url, method="GET", headers=headers)

        try:
            with urllib.request.urlopen(
                request,
                timeout=DATABRICKS_REQUEST_TIMEOUT_SECONDS,
            ) as response:
                status = getattr(response, "status", response.getcode())
                response_etag = response.headers.get("ETag")
                content_range = parse_content_range(
                    response.headers.get("Content-Range")
                )

                if offset > 0 and status == 206:
                    if content_range is None or content_range[0] != offset:
                        raise RuntimeError(
                            "Databricks external result returned an invalid "
                            "Content-Range while resuming the download."
                        )

                    if content_range[2] is not None:
                        expected_total_bytes = content_range[2]
                elif offset > 0 and status == 200:
                    # The server ignored Range, or If-Range detected a changed
                    # object. Restart cleanly from the replacement response.
                    downloaded.clear()
                    offset = 0
                    expected_total_bytes = None
                elif status not in {200, 206}:
                    raise RuntimeError(
                        "Databricks external result returned unexpected HTTP "
                        f"status {status}."
                    )

                if offset == 0:
                    content_length = response.headers.get("Content-Length")
                    if content_range is not None and content_range[2] is not None:
                        expected_total_bytes = content_range[2]
                    elif content_length is not None:
                        try:
                            expected_total_bytes = int(content_length)
                        except ValueError as exc:
                            raise RuntimeError(
                                "Databricks external result returned an invalid "
                                "Content-Length."
                            ) from exc

                    etag = response_etag
                elif etag and response_etag and response_etag != etag:
                    raise RuntimeError(
                        "Databricks external result changed while downloading."
                    )

                while True:
                    try:
                        chunk = response.read(DATABRICKS_EXTERNAL_READ_SIZE_BYTES)
                    except http.client.IncompleteRead as exc:
                        if exc.partial:
                            downloaded.extend(exc.partial)
                        raise

                    if not chunk:
                        break

                    downloaded.extend(chunk)

                if (
                    expected_total_bytes is not None
                    and len(downloaded) < expected_total_bytes
                ):
                    raise http.client.IncompleteRead(
                        bytes(downloaded),
                        expected_total_bytes - len(downloaded),
                    )

                if (
                    expected_total_bytes is not None
                    and len(downloaded) > expected_total_bytes
                ):
                    raise RuntimeError(
                        "Databricks external result exceeded its declared size: "
                        f"expected {expected_total_bytes} bytes, received "
                        f"{len(downloaded)}."
                    )

                return decode_json_payload(
                    bytes(downloaded),
                    "Databricks external result",
                )
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")

            if (
                exc.code in DATABRICKS_RETRYABLE_HTTP_STATUS_CODES
                and attempt < DATABRICKS_EXTERNAL_DOWNLOAD_ATTEMPTS
            ):
                last_error = exc
                time.sleep(
                    retry_delay_seconds(attempt, exc.headers.get("Retry-After"))
                )
                continue

            raise RuntimeError(
                "Databricks external result download failed with "
                f"HTTP {exc.code}: {detail}"
            ) from exc
        except (
            http.client.IncompleteRead,
            TimeoutError,
            urllib.error.URLError,
        ) as exc:
            last_error = exc

            if attempt == DATABRICKS_EXTERNAL_DOWNLOAD_ATTEMPTS:
                break

            time.sleep(retry_delay_seconds(attempt))

    assert last_error is not None
    raise RuntimeError(
        "Databricks external result download failed after "
        f"{DATABRICKS_EXTERNAL_DOWNLOAD_ATTEMPTS} attempts; "
        f"received {len(downloaded)} bytes before the final failure: "
        f"{last_error}"
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
            "disposition": "EXTERNAL_LINKS",
            "format": "JSON_ARRAY",
        },
    )


def cancel_statement(config: DatabricksConfig, statement_id: str) -> None:
    databricks_request(
        config,
        "POST",
        f"https://{config.host}/api/2.0/sql/statements/{statement_id}/cancel",
        {},
    )


def poll_statement(config: DatabricksConfig, statement_id: str) -> dict[str, Any]:
    if not statement_id:
        raise RuntimeError("Databricks did not return a statement ID.")

    deadline = time.monotonic() + DATABRICKS_STATEMENT_TIMEOUT_SECONDS

    while True:
        response = databricks_request(
            config,
            "GET",
            f"https://{config.host}/api/2.0/sql/statements/{statement_id}",
        )
        state = response.get("status", {}).get("state")

        if state in DATABRICKS_TERMINAL_STATES:
            return response

        if time.monotonic() >= deadline:
            try:
                cancel_statement(config, statement_id)
            except RuntimeError:
                pass

            raise RuntimeError(
                "Databricks SQL statement timed out after "
                f"{DATABRICKS_STATEMENT_TIMEOUT_SECONDS:.0f} seconds."
            )

        time.sleep(DATABRICKS_POLL_INTERVAL_SECONDS)


def statement_error_message(response: dict[str, Any]) -> str:
    status = response.get("status", {})
    error = status.get("error", {}) if isinstance(status, dict) else {}

    if isinstance(error, dict):
        message = error.get("message")
        if message:
            return str(message)

    state = status.get("state") if isinstance(status, dict) else None
    return f"Databricks SQL statement ended with state {state or 'UNKNOWN'}."


def result_payload(response: object) -> dict[str, Any]:
    if not isinstance(response, dict):
        raise RuntimeError("Databricks result chunk returned an invalid response.")

    nested_result = response.get("result")
    payload = nested_result if isinstance(nested_result, dict) else response
    return cast(dict[str, Any], payload)


def rows_from_data_array(data: object, columns: list[str]) -> list[JsonRow]:
    if isinstance(data, dict):
        data = data.get("data_array", [])

    if not isinstance(data, list):
        raise RuntimeError("Databricks result chunk did not contain a JSON array.")

    parsed_rows: list[JsonRow] = []

    for row_index, row in enumerate(data):
        if not isinstance(row, list):
            raise RuntimeError(
                "Databricks result row is not an array at chunk row "
                f"{row_index}."
            )

        if len(row) != len(columns):
            raise RuntimeError(
                "Databricks result row has an unexpected column count: "
                f"expected {len(columns)}, received {len(row)}."
            )

        parsed_rows.append(dict(zip(columns, row, strict=True)))

    return parsed_rows


def validate_external_link(link: object) -> dict[str, Any]:
    if not isinstance(link, dict):
        raise RuntimeError("Databricks returned an invalid external result link.")

    external_url = link.get("external_link")
    if not isinstance(external_url, str) or not external_url.startswith("https://"):
        raise RuntimeError("Databricks returned an invalid external result URL.")

    return cast(dict[str, Any], link)


def fetch_result_rows(
    config: DatabricksConfig,
    first_result: object,
    columns: list[str],
) -> list[JsonRow]:
    rows: list[JsonRow] = []
    current_result = result_payload(first_result)
    visited_chunk_links: set[str] = set()
    visited_chunk_indexes: set[int] = set()

    while True:
        external_links = current_result.get("external_links")
        next_chunk_link: object = current_result.get("next_chunk_internal_link")

        if external_links is not None:
            if not isinstance(external_links, list):
                raise RuntimeError(
                    "Databricks external_links field is not an array."
                )

            for raw_link in external_links:
                link = validate_external_link(raw_link)
                chunk_index = link.get("chunk_index")

                if isinstance(chunk_index, int):
                    if chunk_index in visited_chunk_indexes:
                        raise RuntimeError(
                            f"Databricks result chunk {chunk_index} was repeated."
                        )
                    visited_chunk_indexes.add(chunk_index)

                chunk_rows = rows_from_data_array(
                    external_json_request(str(link["external_link"])),
                    columns,
                )
                expected_chunk_rows = link.get("row_count")

                if expected_chunk_rows is not None:
                    try:
                        expected = int(expected_chunk_rows)
                    except (TypeError, ValueError) as exc:
                        raise RuntimeError(
                            "Databricks external result row_count is invalid."
                        ) from exc

                    if len(chunk_rows) != expected:
                        raise RuntimeError(
                            "Databricks external result chunk is incomplete: "
                            f"expected {expected} rows, fetched {len(chunk_rows)}."
                        )

                rows.extend(chunk_rows)

                candidate_next_link = link.get("next_chunk_internal_link")
                if candidate_next_link:
                    next_chunk_link = candidate_next_link
        elif "data_array" in current_result:
            # Defensive compatibility if a workspace returns an inline chunk.
            rows.extend(rows_from_data_array(current_result, columns))
        elif current_result:
            raise RuntimeError(
                "Databricks result contained neither external links nor inline data."
            )

        if next_chunk_link is None or next_chunk_link == "":
            return rows

        if not isinstance(next_chunk_link, str) or not next_chunk_link.startswith("/"):
            raise RuntimeError("Databricks result chunk link must be host-relative.")

        if next_chunk_link in visited_chunk_links:
            raise RuntimeError("Databricks result chunk link repeated.")

        visited_chunk_links.add(next_chunk_link)
        chunk_response = databricks_request(
            config,
            "GET",
            f"https://{config.host}{next_chunk_link}",
        )
        current_result = result_payload(chunk_response)


def query_databricks(config: DatabricksConfig, statement: str) -> list[JsonRow]:
    submitted = submit_statement(config, statement)
    state = submitted.get("status", {}).get("state")

    if state in {"PENDING", "RUNNING"}:
        final_response = poll_statement(
            config,
            str(submitted.get("statement_id", "")),
        )
    else:
        final_response = submitted

    if final_response.get("status", {}).get("state") != "SUCCEEDED":
        raise RuntimeError(statement_error_message(final_response))

    manifest = final_response.get("manifest")
    if not isinstance(manifest, dict):
        raise RuntimeError("Databricks SQL statement returned no result manifest.")

    if manifest.get("truncated") is True:
        raise RuntimeError("Databricks SQL statement result was truncated.")

    schema = manifest.get("schema")
    schema_columns = schema.get("columns", []) if isinstance(schema, dict) else []

    if not isinstance(schema_columns, list):
        raise RuntimeError("Databricks SQL result schema is invalid.")

    columns = [
        str(column["name"])
        for column in schema_columns
        if isinstance(column, dict) and "name" in column
    ]

    if len(columns) != len(schema_columns):
        raise RuntimeError("Databricks SQL result schema contains unnamed columns.")

    rows = fetch_result_rows(
        config,
        final_response.get("result", {}),
        columns,
    )
    total_row_count = manifest.get("total_row_count")

    if total_row_count is not None:
        try:
            expected_row_count = int(total_row_count)
        except (TypeError, ValueError) as exc:
            raise RuntimeError(
                "Databricks manifest total_row_count is invalid."
            ) from exc

        if len(rows) != expected_row_count:
            raise RuntimeError(
                "Databricks SQL statement result is incomplete: "
                f"expected {expected_row_count} rows, fetched {len(rows)}."
            )

    return rows


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
        table_name="site_activity_records",
        columns=(
            "run_id",
            "activity_id",
            "route_id",
            "is_route_representative",
            "activity_date",
            "record_timestamp",
            "record_index",
            "elapsed_seconds",
            "seconds_since_previous_record",
            "record_distance_m",
            "record_distance_km",
            "distance_delta_m",
            "speed_mps",
            "speed_kmh",
            "pace_min_per_km",
            "heart_rate",
            "running_cadence",
            "altitude_m",
            "altitude_delta_m",
            "temperature",
            "position_lat_deg",
            "position_long_deg",
        ),
        statement=lambda config: f"""
            select
              records.run_id,
              records.activity_id,
              sessions.route_id,
              coalesce(records.run_id = sessions.route_representative_run_id, false)
                as is_route_representative,
              cast(records.activity_date as string) as activity_date,
              cast(records.record_timestamp as string) as record_timestamp,
              records.record_index,
              records.elapsed_seconds,
              records.seconds_since_previous_record,
              records.record_distance_m,
              records.record_distance_km,
              records.distance_delta_m,
              records.speed_mps,
              records.speed_kmh,
              records.pace_min_per_km,
              records.heart_rate,
              records.running_cadence,
              records.altitude_m,
              records.altitude_delta_m,
              records.temperature,
              records.position_lat_deg,
              records.position_long_deg
            from {gold_table(config, "mart_activity_records")} as records
            inner join {gold_table(config, "mart_run_sessions")} as sessions
              on records.run_id = sessions.run_id
            order by records.run_id, records.record_index
        """,
    ),
    TableExport(
        table_name="site_route_segments",
        columns=(
            "run_id",
            "route_id",
            "activity_date",
            "unit_system",
            "segment_length_value",
            "segment_length_m",
            "segment_length_label",
            "is_canonical",
            "segment_index",
            "segment_start_boundary_m",
            "segment_end_boundary_m",
            "segment_start_distance_m",
            "segment_end_distance_m",
            "segment_distance_m",
            "segment_distance_value",
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
              segments.unit_system,
              segments.segment_length_value,
              segments.segment_length_m,
              segments.segment_length_label,
              segments.is_canonical,
              segments.segment_index,
              segments.segment_start_boundary_m,
              segments.segment_end_boundary_m,
              segments.segment_start_distance_m,
              segments.segment_end_distance_m,
              segments.segment_distance_m,
              segments.segment_distance_value,
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
            order by
              segments.run_id,
              segments.unit_system,
              segments.segment_length_value,
              segments.segment_index
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

    query = psycopg_sql.SQL("insert into public.{} ({}) values ({})").format(
        psycopg_sql.Identifier(table_export.table_name),
        psycopg_sql.SQL(", ").join(
            psycopg_sql.Identifier(column) for column in table_export.columns
        ),
        psycopg_sql.SQL(", ").join(
            psycopg_sql.Placeholder(column) for column in table_export.columns
        ),
    )

    with connection.cursor() as cursor:
        cursor.executemany(query, rows)


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
            truncate_query = psycopg_sql.SQL("truncate {} restart identity").format(
                psycopg_sql.SQL(", ").join(
                    psycopg_sql.Identifier("public", table_name)
                    for table_name in table_names
                )
            )
            cursor.execute(truncate_query)

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
