from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from ingest.garmin.bronze_schema import BRONZE_TABLES


class GarminBronzeValidationError(ValueError):
    pass


@dataclass(frozen=True)
class GarminBronzeValidationResult:
    warnings: list[str]


def validate_bronze_frames(frames: dict[str, pd.DataFrame]) -> GarminBronzeValidationResult:
    errors: list[str] = []
    warnings: list[str] = []

    for entity, spec in BRONZE_TABLES.items():
        frame = frames.get(entity)

        if frame is None:
            errors.append(f"{entity}: missing parsed frame")
            continue

        missing_columns = [column for column in spec.required_columns if column not in frame.columns]
        if missing_columns:
            errors.append(f"{entity}: missing required columns: {', '.join(missing_columns)}")
            continue

        for column in spec.required_columns:
            if frame[column].isna().any():
                errors.append(f"{entity}: required column contains nulls: {column}")

    sessions = frames.get("sessions", pd.DataFrame())
    records = frames.get("records", pd.DataFrame())
    events = frames.get("events", pd.DataFrame())

    if sessions.empty:
        errors.append("sessions: no session rows were parsed")

    if not sessions.empty and "run_id" in sessions.columns:
        duplicate_session_count = int(sessions["run_id"].duplicated().sum())
        if duplicate_session_count > 0:
            errors.append(f"sessions: duplicate run_id rows: {duplicate_session_count}")

        session_run_ids = set(sessions["run_id"].dropna().astype(str))

        if records.empty or "run_id" not in records.columns:
            errors.append("records: no record rows were parsed for any session")
        else:
            record_run_ids = set(records["run_id"].dropna().astype(str))
            missing_record_run_ids = sorted(session_run_ids - record_run_ids)
            if missing_record_run_ids:
                errors.append(
                    "records: missing record rows for run_id values: "
                    + ", ".join(missing_record_run_ids)
                )

        if events.empty or "run_id" not in events.columns:
            warnings.append("events: no event rows were parsed for any session")
        else:
            event_run_ids = set(events["run_id"].dropna().astype(str))
            missing_event_run_ids = sorted(session_run_ids - event_run_ids)
            if missing_event_run_ids:
                warnings.append(
                    "events: missing event rows for run_id values: "
                    + ", ".join(missing_event_run_ids)
                )

            if {"event", "run_id"}.issubset(events.columns):
                recovery_run_count = events.loc[
                    events["event"].astype(str).eq("recovery_hr"), "run_id"
                ].nunique()
                if int(recovery_run_count) == 0:
                    warnings.append("events: no recovery_hr events were parsed")

    if errors:
        raise GarminBronzeValidationError("; ".join(errors))

    return GarminBronzeValidationResult(warnings=warnings)
