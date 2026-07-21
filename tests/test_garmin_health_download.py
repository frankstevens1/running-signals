from __future__ import annotations

import json
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any, cast

import pytest
from garminconnect import Garmin

from ingest.garmin.health_download import (
    build_health_payload_envelope,
    download_daily_health_payloads_to_store,
    download_incremental_daily_health_payloads_to_store,
    health_payload_envelope_to_json,
    iter_calendar_dates,
    resolve_incremental_health_start_date,
)
from ingest.garmin.health_store import (
    LocalGarminHealthStore,
    S3GarminHealthStore,
    build_s3_health_key,
    parse_health_payload_relative_path,
)


class FakeGarmin:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []
        self.failures: set[tuple[str, str]] = set()

    def get_hrv_data(self, calendar_date: str) -> dict[str, Any]:
        self.calls.append(("get_hrv_data", calendar_date))
        return {"hrvSummary": {"lastNightAvg": 52, "status": "BALANCED"}}

    def get_rhr_day(self, calendar_date: str) -> dict[str, Any]:
        self.calls.append(("get_rhr_day", calendar_date))
        return {"restingHeartRate": 48}

    def get_sleep_data(self, calendar_date: str) -> dict[str, Any]:
        self.calls.append(("get_sleep_data", calendar_date))
        if ("get_sleep_data", calendar_date) in self.failures:
            raise RuntimeError("sleep unavailable")
        return {}

    def get_heart_rates(self, calendar_date: str) -> dict[str, Any]:
        self.calls.append(("get_heart_rates", calendar_date))
        return {"restingHeartRate": 49}


class FakeS3Client:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    def get_paginator(self, name: str) -> FakeS3Paginator:
        assert name == "list_objects_v2"
        return FakeS3Paginator(self.objects)

    def put_object(self, **kwargs: object) -> None:
        assert kwargs["Bucket"] == "raw-bucket"
        self.objects[str(kwargs["Key"])] = bytes(cast(bytes, kwargs["Body"]))


class FakeS3Paginator:
    def __init__(self, objects: dict[str, bytes]) -> None:
        self.objects = objects

    def paginate(self, **kwargs: str) -> list[dict[str, list[dict[str, str]]]]:
        assert kwargs["Bucket"] == "raw-bucket"
        prefix = kwargs.get("Prefix", "")
        keys = sorted(key for key in self.objects if key.startswith(prefix))
        return [{"Contents": [{"Key": key} for key in keys]}]


def test_iter_calendar_dates_validates_range() -> None:
    assert iter_calendar_dates(date(2026, 1, 1), date(2026, 1, 3)) == [
        date(2026, 1, 1),
        date(2026, 1, 2),
        date(2026, 1, 3),
    ]

    with pytest.raises(ValueError, match="end_date"):
        iter_calendar_dates(date(2026, 1, 3), date(2026, 1, 1))


def test_s3_health_key_uses_standard_partition_layout() -> None:
    assert (
        build_s3_health_key(date(2026, 1, 2), "hrv")
        == "garmin/health/daily/calendar_date=2026-01-02/hrv.json"
    )
    assert (
        build_s3_health_key(date(2026, 1, 2), "sleep", "/raw//health/")
        == "raw/health/calendar_date=2026-01-02/sleep.json"
    )


def test_parse_health_payload_relative_path_validates_expected_layout() -> None:
    assert parse_health_payload_relative_path("calendar_date=2026-01-02/hrv.json") == (
        date(2026, 1, 2),
        "hrv",
    )
    assert parse_health_payload_relative_path("calendar_date=bad/hrv.json") is None
    assert parse_health_payload_relative_path("calendar_date=2026-01-02/body_battery.json") is None
    assert parse_health_payload_relative_path("calendar_date=2026-01-02/nested/hrv.json") is None


def test_health_payload_envelope_shape() -> None:
    envelope = build_health_payload_envelope(
        calendar_date=date(2026, 1, 2),
        payload_type="rhr",
        source_method="get_rhr_day",
        payload={"restingHeartRate": 48},
        fetched_at=datetime(2026, 1, 2, 8, 30, tzinfo=UTC),
    )

    assert envelope == {
        "calendar_date": "2026-01-02",
        "payload_type": "rhr",
        "source_method": "get_rhr_day",
        "fetched_at": "2026-01-02T08:30:00+00:00",
        "source_system": "garmin",
        "source_format": "json",
        "payload": {"restingHeartRate": 48},
    }
    assert json.loads(health_payload_envelope_to_json(envelope))["payload_type"] == "rhr"


def test_download_daily_health_payloads_writes_all_endpoint_payloads(tmp_path: Path) -> None:
    store = LocalGarminHealthStore(tmp_path)
    fake_api = FakeGarmin()

    result = download_daily_health_payloads_to_store(
        api=cast(Garmin, fake_api),
        store=store,
        start_date=date(2026, 1, 2),
        end_date=date(2026, 1, 2),
    )

    assert result.inspected_day_count == 1
    assert len(result.written_paths) == 4
    assert result.endpoint_failures == []

    payload_path = tmp_path / "calendar_date=2026-01-02" / "rhr.json"
    payload = json.loads(payload_path.read_text())
    assert payload["calendar_date"] == "2026-01-02"
    assert payload["payload_type"] == "rhr"
    assert payload["payload"] == {"restingHeartRate": 48}


def test_download_daily_health_payloads_reports_partial_endpoint_failures(
    tmp_path: Path,
) -> None:
    store = LocalGarminHealthStore(tmp_path)
    fake_api = FakeGarmin()
    fake_api.failures.add(("get_sleep_data", "2026-01-02"))

    result = download_daily_health_payloads_to_store(
        api=cast(Garmin, fake_api),
        store=store,
        start_date=date(2026, 1, 2),
        end_date=date(2026, 1, 2),
    )

    assert len(result.written_paths) == 3
    assert [(failure.payload_type, failure.error_type) for failure in result.endpoint_failures] == [
        ("sleep", "RuntimeError")
    ]
    assert (tmp_path / "calendar_date=2026-01-02" / "sleep.json").exists() is False


def test_incremental_health_download_skips_existing_payloads(tmp_path: Path) -> None:
    store = LocalGarminHealthStore(tmp_path)
    store.write(date(2026, 1, 2), "rhr", '{"existing": true}')
    fake_api = FakeGarmin()

    result = download_incremental_daily_health_payloads_to_store(
        api=cast(Garmin, fake_api),
        store=store,
        start_date=date(2026, 1, 2),
        end_date=date(2026, 1, 3),
    )

    assert ("get_rhr_day", "2026-01-02") not in fake_api.calls
    assert result.inspected_day_count == 2
    assert len(result.skipped_existing_paths) == 1
    assert len(result.written_paths) == 7
    assert (tmp_path / "calendar_date=2026-01-02" / "rhr.json").read_text() == (
        '{"existing": true}'
    )


def test_incremental_health_download_starts_at_latest_existing_payload_date(
    tmp_path: Path,
) -> None:
    store = LocalGarminHealthStore(tmp_path)

    for payload_type in ("hrv", "rhr", "sleep", "heart_rates"):
        store.write(date(2026, 1, 2), payload_type, '{"existing": true}')

    fake_api = FakeGarmin()

    result = download_incremental_daily_health_payloads_to_store(
        api=cast(Garmin, fake_api),
        store=store,
        end_date=date(2026, 1, 4),
    )

    assert result.inspected_day_count == 3
    assert len(result.skipped_existing_paths) == 4
    assert len(result.written_paths) == 8
    assert ("get_hrv_data", "2026-01-01") not in fake_api.calls
    assert ("get_hrv_data", "2026-01-03") in fake_api.calls
    assert ("get_hrv_data", "2026-01-04") in fake_api.calls


def test_incremental_health_download_defaults_to_end_date_for_empty_store(
    tmp_path: Path,
) -> None:
    store = LocalGarminHealthStore(tmp_path)

    assert resolve_incremental_health_start_date(store, None, date(2026, 1, 4)) == date(
        2026,
        1,
        4,
    )


def test_local_health_store_overwrites_existing_payload(tmp_path: Path) -> None:
    store = LocalGarminHealthStore(tmp_path)

    path = store.write(date(2026, 1, 2), "hrv", '{"value": 1}')
    store.write(date(2026, 1, 2), "hrv", '{"value": 2}')

    assert path.read_text() == '{"value": 2}'


def test_local_health_store_lists_existing_payloads(tmp_path: Path) -> None:
    store = LocalGarminHealthStore(tmp_path)
    store.write(date(2026, 1, 2), "hrv", '{"value": 1}')
    store.write(date(2026, 1, 3), "rhr", '{"value": 2}')
    (tmp_path / "calendar_date=2026-01-03" / "notes.txt").write_text("ignore")

    assert store.exists(date(2026, 1, 2), "hrv") is True
    assert store.exists(date(2026, 1, 2), "sleep") is False
    assert store.list_payloads() == {
        (date(2026, 1, 2), "hrv"),
        (date(2026, 1, 3), "rhr"),
    }


def test_s3_health_store_writes_json_to_standard_key() -> None:
    client = FakeS3Client()
    store = S3GarminHealthStore(bucket="raw-bucket", prefix="garmin/health/daily", client=client)

    location = store.write(date(2026, 1, 2), "heart_rates", '{"restingHeartRate": 49}')

    assert location == (
        "s3://raw-bucket/garmin/health/daily/"
        "calendar_date=2026-01-02/heart_rates.json"
    )
    assert client.objects[
        "garmin/health/daily/calendar_date=2026-01-02/heart_rates.json"
    ] == b'{"restingHeartRate": 49}'


def test_s3_health_store_lists_existing_payloads_under_prefix() -> None:
    client = FakeS3Client()
    client.objects = {
        "garmin/health/daily/calendar_date=2026-01-02/hrv.json": b"{}",
        "garmin/health/daily/calendar_date=2026-01-03/rhr.json": b"{}",
        "garmin/health/daily/calendar_date=2026-01-03/notes.txt": b"ignore",
        "garmin/health/other/calendar_date=2026-01-04/hrv.json": b"ignore",
    }
    store = S3GarminHealthStore(bucket="raw-bucket", prefix="garmin/health/daily", client=client)

    assert store.exists(date(2026, 1, 2), "hrv") is True
    assert store.exists(date(2026, 1, 2), "sleep") is False
    assert store.list_payloads() == {
        (date(2026, 1, 2), "hrv"),
        (date(2026, 1, 3), "rhr"),
    }
