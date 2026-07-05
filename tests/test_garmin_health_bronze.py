from __future__ import annotations

import json
from datetime import UTC, date, datetime
from pathlib import Path

import pandas as pd

from ingest.garmin.health_bronze import (
    ExistingGarminHealthPayload,
    GarminHealthSourceFile,
    build_health_bronze_frame,
    discover_health_payload_files,
    plan_health_payload_files,
    validate_health_bronze_frame,
)


def write_payload(
    root: Path,
    calendar_date: date,
    payload_type: str,
    payload: object,
) -> Path:
    output_path = root / f"calendar_date={calendar_date.isoformat()}" / f"{payload_type}.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(
            {
                "calendar_date": calendar_date.isoformat(),
                "payload_type": payload_type,
                "source_method": f"get_{payload_type}",
                "fetched_at": "2026-01-02T08:30:00+00:00",
                "source_system": "garmin",
                "source_format": "json",
                "payload": payload,
            }
        ),
        encoding="utf-8",
    )
    return output_path


def source_file(
    calendar_date: date = date(2026, 1, 2),
    payload_type: str = "hrv",
    path: Path | None = None,
    size: int = 100,
    modified_at: datetime | None = None,
) -> GarminHealthSourceFile:
    return GarminHealthSourceFile(
        path=path or Path(f"/Volumes/test/health/calendar_date={calendar_date}/{payload_type}.json"),
        calendar_date=calendar_date,
        payload_type=payload_type,
        source_file_size_bytes=size,
        source_file_modification_time=modified_at or datetime(2026, 1, 2, tzinfo=UTC),
    )


def test_discover_health_payload_files_reads_partitioned_json(tmp_path: Path) -> None:
    write_payload(tmp_path, date(2026, 1, 2), "hrv", {"hrvSummary": {"lastNightAvg": 52}})
    write_payload(tmp_path, date(2026, 1, 2), "rhr", {"restingHeartRate": 48})
    (tmp_path / "notes.json").write_text("{}")

    source_files = discover_health_payload_files(tmp_path)

    assert [(item.calendar_date, item.payload_type) for item in source_files] == [
        (date(2026, 1, 2), "hrv"),
        (date(2026, 1, 2), "rhr"),
    ]


def test_plan_health_payload_files_skips_unchanged_and_ingests_changed_files() -> None:
    unchanged = source_file(date(2026, 1, 1), "hrv", size=100)
    changed = source_file(date(2026, 1, 1), "rhr", size=200)
    new = source_file(date(2026, 1, 2), "sleep", size=300)

    existing_payloads = {
        (date(2026, 1, 1), "hrv"): ExistingGarminHealthPayload(
            calendar_date=date(2026, 1, 1),
            payload_type="hrv",
            source_file_size_bytes=100,
            source_file_modification_time=datetime(2026, 1, 2, tzinfo=UTC),
        ),
        (date(2026, 1, 1), "rhr"): ExistingGarminHealthPayload(
            calendar_date=date(2026, 1, 1),
            payload_type="rhr",
            source_file_size_bytes=199,
            source_file_modification_time=datetime(2026, 1, 2, tzinfo=UTC),
        ),
    }

    plan = plan_health_payload_files([unchanged, changed, new], existing_payloads)

    assert plan.changed_keys == [(date(2026, 1, 1), "rhr"), (date(2026, 1, 2), "sleep")]
    assert plan.skipped_keys == [(date(2026, 1, 1), "hrv")]


def test_build_health_bronze_frame_preserves_raw_payload_and_metadata(tmp_path: Path) -> None:
    payload_path = write_payload(
        tmp_path,
        date(2026, 1, 2),
        "heart_rates",
        {"restingHeartRate": 49},
    )
    source_files = discover_health_payload_files(tmp_path)
    ingested_at = datetime(2026, 1, 3, 8, 30, tzinfo=UTC)

    frame = build_health_bronze_frame(source_files, ingested_at=ingested_at)

    assert len(frame) == 1
    assert frame.loc[0, "calendar_date"] == date(2026, 1, 2)
    assert frame.loc[0, "payload_type"] == "heart_rates"
    assert json.loads(frame.loc[0, "raw_payload"]) == {"restingHeartRate": 49}
    assert frame.loc[0, "source_file_path"] == str(payload_path)
    assert frame.loc[0, "source_system"] == "garmin"
    assert frame.loc[0, "source_format"] == "json"
    assert frame.loc[0, "ingested_at"] == ingested_at


def test_validate_health_bronze_frame_fails_on_duplicate_date_and_payload() -> None:
    frame = pd.DataFrame(
        [
            {
                "calendar_date": date(2026, 1, 2),
                "payload_type": "hrv",
                "raw_payload": "{}",
                "source_file_path": "a",
                "source_file_name": "hrv.json",
                "source_file_size_bytes": 10,
                "source_file_modification_time": datetime(2026, 1, 2, tzinfo=UTC),
                "ingested_at": datetime(2026, 1, 3, tzinfo=UTC),
                "ingestion_date": date(2026, 1, 3),
                "source_system": "garmin",
                "source_format": "json",
            },
            {
                "calendar_date": date(2026, 1, 2),
                "payload_type": "hrv",
                "raw_payload": "{}",
                "source_file_path": "b",
                "source_file_name": "hrv.json",
                "source_file_size_bytes": 11,
                "source_file_modification_time": datetime(2026, 1, 2, tzinfo=UTC),
                "ingested_at": datetime(2026, 1, 3, tzinfo=UTC),
                "ingestion_date": date(2026, 1, 3),
                "source_system": "garmin",
                "source_format": "json",
            },
        ]
    )

    try:
        validate_health_bronze_frame(frame)
    except ValueError as exc:
        assert "duplicate calendar_date + payload_type" in str(exc)
    else:
        raise AssertionError("Expected duplicate health bronze frame to fail validation.")
