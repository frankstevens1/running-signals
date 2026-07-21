from __future__ import annotations

import http.client
import io
import time
import urllib.error
import urllib.request
from email.message import Message
from pathlib import Path
from types import TracebackType
from typing import Literal

import pytest
from pytest import MonkeyPatch

from scripts import sync_site_supabase


class FakeResponse:
    def __init__(self, payload: bytes) -> None:
        self.payload = payload

    def __enter__(self) -> FakeResponse:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> Literal[False]:
        return False

    def read(self) -> bytes:
        return self.payload


def databricks_config() -> sync_site_supabase.DatabricksConfig:
    return sync_site_supabase.DatabricksConfig(
        host="example.databricks.com",
        token="token",
        warehouse_id="warehouse",
        catalog="running_signals",
        schema="gold",
    )


def test_databricks_request_retries_incomplete_response_read(
    monkeypatch: MonkeyPatch,
) -> None:
    calls = 0

    def fake_urlopen(request: urllib.request.Request, timeout: int) -> FakeResponse:
        nonlocal calls
        calls += 1

        if calls == 1:
            raise http.client.IncompleteRead(b'{"partial":', 12)

        return FakeResponse(b'{"status": {"state": "SUCCEEDED"}}')

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(time, "sleep", lambda seconds: None)

    result = sync_site_supabase.databricks_request(
        databricks_config(),
        "POST",
        "https://example.databricks.com/api/2.0/sql/statements",
        {"statement": "select 1"},
    )

    assert calls == 2
    assert result == {"status": {"state": "SUCCEEDED"}}


def test_databricks_request_does_not_retry_http_errors(
    monkeypatch: MonkeyPatch,
) -> None:
    calls = 0

    def fake_urlopen(request: urllib.request.Request, timeout: int) -> FakeResponse:
        nonlocal calls
        calls += 1
        raise urllib.error.HTTPError(
            url="https://example.databricks.com/api/2.0/sql/statements",
            code=401,
            msg="Unauthorized",
            hdrs=Message(),
            fp=io.BytesIO(b'{"message":"bad token"}'),
        )

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

    with pytest.raises(RuntimeError, match="Databricks request failed with HTTP 401"):
        sync_site_supabase.databricks_request(
            databricks_config(),
            "POST",
            "https://example.databricks.com/api/2.0/sql/statements",
            {"statement": "select 1"},
        )

    assert calls == 1


def test_query_databricks_reads_all_inline_result_chunks(monkeypatch: MonkeyPatch) -> None:
    config = databricks_config()
    chunk_urls: list[str] = []

    monkeypatch.setattr(
        sync_site_supabase,
        "submit_statement",
        lambda config, statement: {
            "status": {"state": "SUCCEEDED"},
            "manifest": {
                "total_row_count": 3,
                "schema": {
                    "columns": [
                        {"name": "run_id"},
                        {"name": "record_index"},
                    ]
                }
            },
            "result": {
                "data_array": [["run-1", "1"]],
                "next_chunk_internal_link": "/api/2.0/sql/statements/statement/result/chunks/1",
            },
        },
    )

    def fake_databricks_request(
        config: sync_site_supabase.DatabricksConfig,
        method: str,
        url: str,
        payload: dict[str, object] | None = None,
    ) -> dict[str, object]:
        assert method == "GET"
        assert payload is None
        chunk_urls.append(url)

        if url.endswith("/chunks/1"):
            return {
                "data_array": [["run-1", "2"]],
                "next_chunk_internal_link": (
                    "/api/2.0/sql/statements/statement/result/chunks/2"
                ),
            }

        return {
            "data_array": [["run-2", "1"]],
        }

    monkeypatch.setattr(
        sync_site_supabase,
        "databricks_request",
        fake_databricks_request,
    )

    assert sync_site_supabase.query_databricks(config, "select records") == [
        {"run_id": "run-1", "record_index": "1"},
        {"run_id": "run-1", "record_index": "2"},
        {"run_id": "run-2", "record_index": "1"},
    ]
    assert chunk_urls == [
        "https://example.databricks.com/api/2.0/sql/statements/statement/result/chunks/1",
        "https://example.databricks.com/api/2.0/sql/statements/statement/result/chunks/2",
    ]


def test_query_databricks_rejects_truncated_results(monkeypatch: MonkeyPatch) -> None:
    monkeypatch.setattr(
        sync_site_supabase,
        "submit_statement",
        lambda config, statement: {
            "status": {"state": "SUCCEEDED"},
            "manifest": {
                "truncated": True,
                "total_row_count": 1,
                "schema": {"columns": [{"name": "run_id"}]},
            },
            "result": {"data_array": [["run-1"]]},
        },
    )

    with pytest.raises(RuntimeError, match="result was truncated"):
        sync_site_supabase.query_databricks(databricks_config(), "select records")


def test_query_databricks_rejects_row_count_mismatch(monkeypatch: MonkeyPatch) -> None:
    monkeypatch.setattr(
        sync_site_supabase,
        "submit_statement",
        lambda config, statement: {
            "status": {"state": "SUCCEEDED"},
            "manifest": {
                "total_row_count": 2,
                "schema": {"columns": [{"name": "run_id"}]},
            },
            "result": {"data_array": [["run-1"]]},
        },
    )

    with pytest.raises(RuntimeError, match="expected 2 rows, fetched 1"):
        sync_site_supabase.query_databricks(databricks_config(), "select records")


def test_site_activity_records_export_includes_ordered_presentation_telemetry() -> None:
    export = next(
        table_export
        for table_export in sync_site_supabase.EXPORTS
        if table_export.table_name == "site_activity_records"
    )

    assert export.columns == (
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
    )

    statement = export.statement(databricks_config())

    assert "`running_signals`.`gold`.`mart_activity_records`" in statement
    assert "inner join `running_signals`.`gold`.`mart_run_sessions`" in statement
    assert "coalesce(records.run_id = sessions.route_representative_run_id, false)" in statement
    assert "order by records.run_id, records.record_index" in statement
    assert "where" not in statement.lower()


def test_site_routes_export_includes_representative_route_centroids() -> None:
    export = next(
        table_export
        for table_export in sync_site_supabase.EXPORTS
        if table_export.table_name == "site_routes"
    )

    assert export.columns[-2:] == (
        "representative_route_centroid_latitude_deg",
        "representative_route_centroid_longitude_deg",
    )

    statement = export.statement(databricks_config())

    assert "representative_route_centroid_latitude_deg" in statement
    assert "representative_route_centroid_longitude_deg" in statement


def test_site_route_segments_export_includes_resolution_and_detail_columns() -> None:
    export = next(
        table_export
        for table_export in sync_site_supabase.EXPORTS
        if table_export.table_name == "site_route_segments"
    )

    assert export.columns == (
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
    )

    statement = export.statement(databricks_config())

    assert "segments.unit_system" in statement
    assert "segments.segment_length_value" in statement
    assert "segments.segment_length_m" in statement
    assert "segments.segment_length_label" in statement
    assert "segments.is_canonical" in statement
    assert "segments.segment_start_boundary_m" in statement
    assert "segments.segment_end_boundary_m" in statement
    assert "segments.segment_distance_m" in statement
    assert "segments.segment_distance_value" in statement
    assert "segments.segment_duration_seconds" in statement
    assert "segments.segment_pace_min_per_km" in statement
    assert "segments.avg_speed_kmh" in statement
    assert "segments.max_heart_rate" in statement
    assert "segments.avg_running_cadence" in statement
    assert "segments.min_altitude_m" in statement
    assert "segments.max_altitude_m" in statement
    assert "segments.elevation_change_m" in statement
    assert "segments.segment_grade" in statement
    assert "segment_start_distance_km" in statement
    assert "segment_end_distance_km" in statement
    assert "segments.unit_system," in statement
    assert "segments.segment_length_value," in statement
    assert "segments.segment_index" in statement


def test_supabase_migration_uses_resolution_aware_keys_and_public_read_policy() -> None:
    migration = (
        Path(__file__).parents[1]
        / "supabase/migrations/202607120001_activity_records_and_segment_resolutions.sql"
    ).read_text()

    assert "create table public.site_activity_records" in migration
    assert "primary key (run_id, record_index)" in migration
    assert "site_activity_records_route_idx" in migration
    assert "on public.site_activity_records for select" in migration
    assert (
        "add primary key (run_id, unit_system, segment_length_value, segment_index)"
        in migration
    )


def test_route_centroid_migration_adds_nullable_site_route_coordinates() -> None:
    migration = (
        Path(__file__).parents[1] / "supabase/migrations/202607210001_route_centroids.sql"
    ).read_text()

    assert "add column representative_route_centroid_latitude_deg double precision" in migration
    assert "add column representative_route_centroid_longitude_deg double precision" in migration
