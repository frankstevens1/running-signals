from pathlib import Path

import pandas as pd
from garmin_fit_sdk import Decoder, Stream

from ingest.garmin.fields import EVENT_FIELDS, RECORD_FIELDS, SESSION_FIELDS
from ingest.garmin.transforms import (
    add_degree_coordinates,
    filter_relevant_events,
    select_fields,
)


def decode_fit_file(path: Path) -> dict:
    stream = Stream.from_file(path)
    decoder = Decoder(stream)
    messages, errors = decoder.read()

    if errors:
        # Exploration only: keep going, but make errors visible.
        print(f"Decode warnings for {path.name}: {errors}")

    return messages


def parse_fit_file(path: Path) -> dict[str, pd.DataFrame]:
    messages = decode_fit_file(path)
    run_id = path.stem

    sessions = _message_to_frame(messages, "session_mesgs", SESSION_FIELDS, run_id)
    events = _message_to_frame(messages, "event_mesgs", EVENT_FIELDS, run_id)
    records = _message_to_frame(messages, "record_mesgs", RECORD_FIELDS, run_id)

    sessions = add_degree_coordinates(sessions)
    records = add_degree_coordinates(records)
    events = filter_relevant_events(events)

    return {
        "sessions": sessions,
        "events": events,
        "records": records,
    }


def parse_fit_files(paths: list[Path]) -> dict[str, pd.DataFrame]:
    parsed = [parse_fit_file(path) for path in paths]

    return {
        "sessions": _concat([item["sessions"] for item in parsed]),
        "events": _concat([item["events"] for item in parsed]),
        "records": _concat([item["records"] for item in parsed]),
    }


def _message_to_frame(
    messages: dict,
    message_name: str,
    fields: list[str],
    run_id: str,
) -> pd.DataFrame:
    rows = messages.get(message_name, [])

    if not rows:
        return pd.DataFrame(columns=[*fields, "run_id"])

    df = pd.DataFrame(rows)
    df["run_id"] = run_id

    return select_fields(df, [*fields, "run_id"])


def _concat(frames: list[pd.DataFrame]) -> pd.DataFrame:
    non_empty = [frame for frame in frames if not frame.empty]

    if not non_empty:
        return pd.DataFrame()

    return pd.concat(non_empty, ignore_index=True)