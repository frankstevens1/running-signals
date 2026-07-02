from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any, cast

import pytest
from garminconnect import Garmin

from ingest.garmin.download import (
    download_incremental_running_fit_files_to_store,
    download_incremental_running_fit_files,
    overwrite_running_fit_files_for_range_to_store,
    overwrite_running_fit_files_for_range,
)
from ingest.garmin.fit_store import S3GarminFitStore, build_s3_fit_key


class FakeActivityDownloadFormat:
    ORIGINAL = "original"


class FakeGarmin:
    ActivityDownloadFormat = FakeActivityDownloadFormat

    def __init__(
        self,
        recent_activities: list[dict[str, Any]] | None = None,
        range_activities: list[dict[str, Any]] | None = None,
    ) -> None:
        self.recent_activities = recent_activities or []
        self.range_activities = range_activities or []
        self.downloaded_activity_ids: list[str] = []

    def get_activities(
        self,
        start: int = 0,
        limit: int = 20,
        activitytype: str | None = None,
    ) -> list[dict[str, Any]]:
        assert activitytype == "running"
        return self.recent_activities[start : start + limit]

    def get_activities_by_date(
        self,
        startdate: str,
        enddate: str | None = None,
        activitytype: str | None = None,
        sortorder: str | None = None,
    ) -> list[dict[str, Any]]:
        assert startdate
        assert enddate
        assert activitytype == "running"
        assert sortorder is None
        return self.range_activities

    def download_activity(self, activity_id: str, dl_fmt: str) -> bytes:
        assert dl_fmt == FakeActivityDownloadFormat.ORIGINAL
        self.downloaded_activity_ids.append(activity_id)
        return b"00000000.FIT" + activity_id.encode()


class FakeS3Paginator:
    def __init__(self, objects: dict[str, bytes]) -> None:
        self.objects = objects

    def paginate(self, **kwargs: str) -> list[dict[str, list[dict[str, str]]]]:
        bucket = kwargs["Bucket"]
        assert bucket == "raw-bucket"
        prefix = kwargs.get("Prefix", "")
        keys = sorted(key for key in self.objects if key.startswith(prefix))
        return [{"Contents": [{"Key": key} for key in keys]}]


class FakeS3Client:
    def __init__(self, objects: dict[str, bytes] | None = None) -> None:
        self.objects = objects or {}
        self.deleted_keys: list[str] = []

    def get_paginator(self, name: str) -> FakeS3Paginator:
        assert name == "list_objects_v2"
        return FakeS3Paginator(self.objects)

    def put_object(self, **kwargs: object) -> None:
        assert kwargs["Bucket"] == "raw-bucket"
        self.objects[str(kwargs["Key"])] = bytes(cast(bytes, kwargs["Body"]))

    def delete_objects(self, **kwargs: object) -> None:
        assert kwargs["Bucket"] == "raw-bucket"
        delete = cast(dict[str, list[dict[str, str]]], kwargs["Delete"])

        for item in delete["Objects"]:
            key = item["Key"]
            self.deleted_keys.append(key)
            self.objects.pop(key, None)


def fit_path(directory: Path, activity_id: str) -> Path:
    return directory / f"{activity_id}.fit"


def test_incremental_download_requires_existing_fit_baseline(tmp_path: Path) -> None:
    fake_api = FakeGarmin(recent_activities=[{"activityId": "101"}])

    with pytest.raises(FileNotFoundError, match="requires at least one existing"):
        download_incremental_running_fit_files(cast(Garmin, fake_api), tmp_path)

    assert fake_api.downloaded_activity_ids == []


def test_incremental_download_appends_until_first_existing_fit_file(tmp_path: Path) -> None:
    fit_path(tmp_path, "100").write_bytes(b"existing")
    fake_api = FakeGarmin(
        recent_activities=[
            {"activityId": "102"},
            {"activityId": "101"},
            {"activityId": "100"},
            {"activityId": "99"},
        ]
    )

    result = download_incremental_running_fit_files(
        cast(Garmin, fake_api),
        tmp_path,
        limit=10,
        page_size=10,
    )

    assert fake_api.downloaded_activity_ids == ["102", "101"]
    assert [path.name for path in result.downloaded_paths] == ["102.fit", "101.fit"]
    assert result.skipped_existing_paths == [fit_path(tmp_path, "100")]
    assert fit_path(tmp_path, "99").exists() is False


def test_range_overwrite_deletes_fit_files_and_downloads_only_range(tmp_path: Path) -> None:
    fit_path(tmp_path, "old").write_bytes(b"existing")
    (tmp_path / "notes.txt").write_text("keep")
    fake_api = FakeGarmin(
        range_activities=[
            {"activityId": "101", "startTimeLocal": "2026-01-15 08:00:00"},
            {"activityId": "099", "startTimeLocal": "2025-12-31 08:00:00"},
            {"activityId": "102", "startTimeLocal": "2026-02-01 08:00:00"},
        ]
    )

    result = overwrite_running_fit_files_for_range(
        cast(Garmin, fake_api),
        tmp_path,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 1, 31),
    )

    assert fake_api.downloaded_activity_ids == ["101"]
    assert [path.name for path in result.deleted_existing_paths] == ["old.fit"]
    assert [path.name for path in result.downloaded_paths] == ["101.fit"]
    assert fit_path(tmp_path, "old").exists() is False
    assert fit_path(tmp_path, "099").exists() is False
    assert fit_path(tmp_path, "102").exists() is False
    assert (tmp_path / "notes.txt").read_text() == "keep"


def test_s3_fit_key_uses_standard_prefix_layout() -> None:
    assert build_s3_fit_key("123") == "garmin/fit/123.fit"
    assert build_s3_fit_key("123", "/garmin//fit/") == "garmin/fit/123.fit"


def test_s3_incremental_skips_existing_key() -> None:
    client = FakeS3Client(objects={"garmin/fit/100.fit": b"existing"})
    store = S3GarminFitStore(bucket="raw-bucket", prefix="garmin/fit", client=client)
    fake_api = FakeGarmin(
        recent_activities=[
            {"activityId": "102"},
            {"activityId": "101"},
            {"activityId": "100"},
            {"activityId": "99"},
        ]
    )

    result = download_incremental_running_fit_files_to_store(
        cast(Garmin, fake_api),
        store,
        limit=10,
        page_size=10,
    )

    assert fake_api.downloaded_activity_ids == ["102", "101"]
    assert result.downloaded_paths == [
        "s3://raw-bucket/garmin/fit/102.fit",
        "s3://raw-bucket/garmin/fit/101.fit",
    ]
    assert result.skipped_existing_paths == ["s3://raw-bucket/garmin/fit/100.fit"]
    assert "garmin/fit/99.fit" not in client.objects


def test_s3_incremental_requires_existing_fit_baseline() -> None:
    client = FakeS3Client()
    store = S3GarminFitStore(bucket="raw-bucket", prefix="garmin/fit", client=client)
    fake_api = FakeGarmin(recent_activities=[{"activityId": "101"}])

    with pytest.raises(FileNotFoundError, match="requires at least one existing"):
        download_incremental_running_fit_files_to_store(cast(Garmin, fake_api), store)

    assert fake_api.downloaded_activity_ids == []


def test_s3_range_overwrite_deletes_only_fit_keys_under_prefix() -> None:
    client = FakeS3Client(
        objects={
            "garmin/fit/old.fit": b"old",
            "garmin/fit/notes.txt": b"keep",
            "garmin/fit/nested.fit": b"delete",
            "garmin/other/unrelated.fit": b"keep",
        }
    )
    store = S3GarminFitStore(bucket="raw-bucket", prefix="garmin/fit", client=client)
    fake_api = FakeGarmin(
        range_activities=[
            {"activityId": "101", "startTimeLocal": "2026-01-15 08:00:00"},
            {"activityId": "099", "startTimeLocal": "2025-12-31 08:00:00"},
        ]
    )

    result = overwrite_running_fit_files_for_range_to_store(
        cast(Garmin, fake_api),
        store,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 1, 31),
    )

    assert sorted(client.deleted_keys) == ["garmin/fit/nested.fit", "garmin/fit/old.fit"]
    assert result.downloaded_paths == ["s3://raw-bucket/garmin/fit/101.fit"]
    assert "garmin/fit/101.fit" in client.objects
    assert "garmin/fit/notes.txt" in client.objects
    assert "garmin/other/unrelated.fit" in client.objects


def test_s3_range_overwrite_refuses_empty_prefix() -> None:
    client = FakeS3Client(objects={"old.fit": b"old"})
    store = S3GarminFitStore(bucket="raw-bucket", prefix="", client=client)
    fake_api = FakeGarmin()

    with pytest.raises(ValueError, match="prefix is empty"):
        overwrite_running_fit_files_for_range_to_store(
            cast(Garmin, fake_api),
            store,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 1, 31),
        )

    assert client.objects == {"old.fit": b"old"}
