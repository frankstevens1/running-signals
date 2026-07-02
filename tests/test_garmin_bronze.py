from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pandas as pd
import pytest

from ingest.garmin.bronze import (
    ExistingGarminFitRun,
    GarminFitSourceFile,
    enrich_bronze_frames,
    plan_fit_files,
)
from ingest.garmin.quality import GarminBronzeValidationError, validate_bronze_frames


def source_file(
    run_id: str = "21523624126",
    path: Path | None = None,
    size: int = 100,
    modified_at: datetime | None = None,
) -> GarminFitSourceFile:
    return GarminFitSourceFile(
        path=path or Path(f"/Volumes/test/fit/{run_id}.fit"),
        run_id=run_id,
        source_file_size_bytes=size,
        source_file_modification_time=modified_at or datetime(2026, 1, 12, tzinfo=UTC),
    )


def parsed_frames() -> dict[str, pd.DataFrame]:
    return {
        "sessions": pd.DataFrame(
            [
                {
                    "run_id": "21523624126",
                    "timestamp": "2026-01-12T15:22:46Z",
                    "start_time": "2026-01-12T15:22:46Z",
                    "total_distance": 6440.24,
                    "sport": "running",
                }
            ]
        ),
        "events": pd.DataFrame(
            [
                {
                    "run_id": "21523624126",
                    "timestamp": "2026-01-12T15:22:46Z",
                    "data": 0,
                    "event": "timer",
                    "event_type": "start",
                }
            ]
        ),
        "records": pd.DataFrame(
            [
                {
                    "run_id": "21523624126",
                    "timestamp": "2026-01-12T15:22:46Z",
                    "distance": 0.91,
                    "heart_rate": 82,
                }
            ]
        ),
    }


def test_plan_fit_files_skips_unchanged_and_parses_changed_files() -> None:
    unchanged = source_file("1", size=100, modified_at=datetime(2026, 1, 1, tzinfo=UTC))
    changed = source_file("2", size=200, modified_at=datetime(2026, 1, 2, tzinfo=UTC))
    new = source_file("3", size=300, modified_at=datetime(2026, 1, 3, tzinfo=UTC))

    existing_runs = {
        "1": ExistingGarminFitRun(
            run_id="1",
            source_file_size_bytes=100,
            source_file_modification_time=datetime(2026, 1, 1, tzinfo=UTC),
        ),
        "2": ExistingGarminFitRun(
            run_id="2",
            source_file_size_bytes=199,
            source_file_modification_time=datetime(2026, 1, 2, tzinfo=UTC),
        ),
    }

    plan = plan_fit_files([unchanged, changed, new], existing_runs)

    assert [item.run_id for item in plan.files_to_parse] == ["2", "3"]
    assert plan.changed_run_ids == ["2", "3"]
    assert plan.skipped_run_ids == ["1"]


def test_enrich_bronze_frames_adds_metadata_and_run_date() -> None:
    ingested_at = datetime(2026, 6, 29, 8, 30, tzinfo=UTC)

    enriched = enrich_bronze_frames(
        parsed_frames(),
        [source_file()],
        ingested_at=ingested_at,
    )

    sessions = enriched["sessions"]
    events = enriched["events"]
    records = enriched["records"]

    assert sessions.loc[0, "garmin_activity_id"] == "21523624126"
    assert sessions.loc[0, "source_system"] == "garmin"
    assert sessions.loc[0, "source_format"] == "fit"
    assert sessions.loc[0, "run_date"] == datetime(2026, 1, 12).date()
    assert events.loc[0, "run_date"] == datetime(2026, 1, 12).date()
    assert records.loc[0, "run_date"] == datetime(2026, 1, 12).date()


def test_validate_bronze_frames_fails_on_duplicate_sessions() -> None:
    frames = parsed_frames()
    frames["sessions"] = pd.concat([frames["sessions"], frames["sessions"]], ignore_index=True)
    enriched = enrich_bronze_frames(frames, [source_file()])

    with pytest.raises(GarminBronzeValidationError, match="duplicate run_id"):
        validate_bronze_frames(enriched)


def test_validate_bronze_frames_fails_when_records_missing_for_session() -> None:
    frames = parsed_frames()
    frames["records"] = pd.DataFrame(columns=["run_id", "timestamp"])
    enriched = enrich_bronze_frames(frames, [source_file()])

    with pytest.raises(GarminBronzeValidationError, match="records"):
        validate_bronze_frames(enriched)


def test_validate_bronze_frames_warns_for_empty_events() -> None:
    frames = parsed_frames()
    frames["events"] = pd.DataFrame(columns=["run_id", "timestamp", "event", "event_type", "data"])
    enriched = enrich_bronze_frames(frames, [source_file()])

    result = validate_bronze_frames(enriched)

    assert result.warnings == ["events: no event rows were parsed for any session"]
