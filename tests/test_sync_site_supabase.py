from __future__ import annotations

import http.client
import io
import time
import urllib.error
import urllib.request
from email.message import Message
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


def test_site_route_segments_export_includes_segment_detail_columns() -> None:
    export = next(
        table_export
        for table_export in sync_site_supabase.EXPORTS
        if table_export.table_name == "site_route_segments"
    )

    assert export.columns == (
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
    )

    statement = export.statement(databricks_config())

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
