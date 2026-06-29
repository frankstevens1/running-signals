from __future__ import annotations

import io
import zipfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from garminconnect import Garmin


def parse_since_arg(value: str) -> date | None:
    normalized = value.strip().lower()

    if normalized in {"0", "all", "none", "off"}:
        return None

    if normalized.isdecimal():
        return date.today() - timedelta(days=int(normalized))

    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("--since must be YYYY-MM-DD, days, or 'all'.") from exc


def one_year_ago(today: date | None = None) -> date:
    today = today or date.today()

    try:
        return today.replace(year=today.year - 1)
    except ValueError:
        return today.replace(month=2, day=28, year=today.year - 1)


def normalize_activities(raw_activities: dict[str, Any] | list[Any]) -> list[dict[str, Any]]:
    if isinstance(raw_activities, list):
        return [activity for activity in raw_activities if isinstance(activity, dict)]

    if isinstance(raw_activities, dict):
        activity_list = raw_activities.get("activityList", [])
        if isinstance(activity_list, list):
            return [activity for activity in activity_list if isinstance(activity, dict)]

    return []


def parse_activity_date_value(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()

    if isinstance(value, date):
        return value

    if isinstance(value, (int, float)):
        timestamp = value / 1000 if value > 10_000_000_000 else value
        return datetime.fromtimestamp(timestamp, tz=timezone.utc).date()

    if not isinstance(value, str):
        return None

    text = value.strip()
    if not text:
        return None

    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).date()
    except ValueError:
        pass

    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def get_activity_date(activity: dict[str, Any]) -> date | None:
    summary = activity.get("summaryDTO")

    candidates = [
        activity.get("startTimeLocal"),
        activity.get("startTimeGMT"),
        activity.get("activityDate"),
        activity.get("startLocal"),
        activity.get("beginTimestamp"),
    ]

    if isinstance(summary, dict):
        candidates.append(summary.get("startTimeLocal"))

    for candidate in candidates:
        activity_date = parse_activity_date_value(candidate)
        if activity_date is not None:
            return activity_date

    return None


def extract_fit_from_zip_bytes(zip_bytes: bytes) -> tuple[str, bytes]:
    with zipfile.ZipFile(io.BytesIO(zip_bytes), mode="r") as zip_file:
        fit_members = [
            item
            for item in zip_file.infolist()
            if not item.is_dir() and item.filename.lower().endswith(".fit")
        ]

        if not fit_members:
            raise FileNotFoundError("No .fit file found in downloaded Garmin archive.")

        member = max(fit_members, key=lambda item: item.file_size)

        with zip_file.open(member, "r") as file:
            return member.filename, file.read()


def is_fit_bytes(payload: bytes) -> bool:
    return len(payload) >= 12 and payload[8:12] == b".FIT"


def extract_fit_from_download_bytes(download_bytes: bytes) -> tuple[str, bytes]:
    if zipfile.is_zipfile(io.BytesIO(download_bytes)):
        filename, fit_bytes = extract_fit_from_zip_bytes(download_bytes)

        if not is_fit_bytes(fit_bytes):
            raise ValueError(f"Downloaded archive member is not a valid FIT file: {filename}")

        return filename, fit_bytes

    if is_fit_bytes(download_bytes):
        return "activity.fit", download_bytes

    raise ValueError("Downloaded Garmin activity payload is neither a ZIP archive nor a FIT file.")


def filter_activities_since(
    activities: list[dict[str, Any]],
    since: date | None,
) -> list[dict[str, Any]]:
    if since is None:
        return activities

    filtered: list[dict[str, Any]] = []

    for activity in activities:
        activity_date = get_activity_date(activity)

        if activity_date is None:
            continue

        if activity_date >= since:
            filtered.append(activity)

    return filtered


def download_running_fit_files(
    api: Garmin,
    output_dir: Path,
    limit: int = 50,
    since: date | None = None,
    overwrite: bool = False,
) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)

    raw_activities = api.get_activities(
        start=0,
        limit=limit,
        activitytype="running",
    )

    activities = normalize_activities(raw_activities)
    activities = filter_activities_since(activities, since)

    saved_paths: list[Path] = []
    download_format = api.ActivityDownloadFormat.ORIGINAL

    for activity in activities:
        activity_id = activity.get("activityId")

        if activity_id is None:
            continue

        output_path = output_dir / f"{activity_id}.fit"

        if output_path.exists() and not overwrite:
            saved_paths.append(output_path)
            continue

        download_bytes = api.download_activity(str(activity_id), dl_fmt=download_format)
        _, fit_bytes = extract_fit_from_download_bytes(download_bytes)

        output_path.write_bytes(fit_bytes)
        saved_paths.append(output_path)

    return saved_paths
