from __future__ import annotations

import io
import zipfile
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from garminconnect import Garmin

from ingest.garmin.fit_store import FitFileLocation, GarminFitStore, LocalGarminFitStore


@dataclass(frozen=True)
class GarminFitDownloadResult:
    downloaded_paths: list[FitFileLocation]
    skipped_existing_paths: list[FitFileLocation]
    deleted_existing_paths: list[FitFileLocation]
    inspected_activity_count: int

    @property
    def local_paths(self) -> list[Path]:
        return [
            path
            for path in [*self.downloaded_paths, *self.skipped_existing_paths]
            if isinstance(path, Path)
        ]


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


def filter_activities_in_range(
    activities: list[dict[str, Any]],
    start_date: date,
    end_date: date,
) -> list[dict[str, Any]]:
    filtered: list[dict[str, Any]] = []

    for activity in activities:
        activity_date = get_activity_date(activity)

        if activity_date is None:
            continue

        if start_date <= activity_date <= end_date:
            filtered.append(activity)

    return filtered


def get_existing_fit_activity_ids(output_dir: Path) -> set[str]:
    return LocalGarminFitStore(output_dir).list_activity_ids()


def delete_existing_fit_files(output_dir: Path) -> list[Path]:
    return LocalGarminFitStore(output_dir).delete_existing_fit_files()


def activity_id_as_str(activity: dict[str, Any]) -> str | None:
    activity_id = activity.get("activityId")

    if activity_id is None:
        return None

    return str(activity_id)


def download_activity_fit_bytes(api: Garmin, activity_id: str) -> bytes:
    download_bytes = api.download_activity(
        activity_id,
        dl_fmt=api.ActivityDownloadFormat.ORIGINAL,
    )
    _, fit_bytes = extract_fit_from_download_bytes(download_bytes)
    return fit_bytes


def download_activity_fit_file(api: Garmin, activity_id: str, output_path: Path) -> Path:
    fit_bytes = download_activity_fit_bytes(api, activity_id)
    output_path.write_bytes(fit_bytes)
    return output_path


def download_incremental_running_fit_files_to_store(
    api: Garmin,
    store: GarminFitStore,
    limit: int = 200,
    page_size: int = 50,
) -> GarminFitDownloadResult:
    existing_activity_ids = store.list_activity_ids()

    if not existing_activity_ids:
        raise FileNotFoundError(
            "Incremental Garmin FIT refresh requires at least one existing .fit file. "
            "Run a range overwrite first to establish the baseline."
        )

    downloaded_paths: list[FitFileLocation] = []
    skipped_existing_paths: list[FitFileLocation] = []
    inspected_activity_count = 0
    start = 0

    while inspected_activity_count < limit:
        page_limit = min(page_size, limit - inspected_activity_count)

        raw_activities = api.get_activities(
            start=start,
            limit=page_limit,
            activitytype="running",
        )

        activities = normalize_activities(raw_activities)

        if not activities:
            break

        for activity in activities:
            inspected_activity_count += 1
            activity_id = activity_id_as_str(activity)

            if activity_id is None:
                continue

            output_path = store.location_for_activity_id(activity_id)

            if activity_id in existing_activity_ids or store.exists(activity_id):
                skipped_existing_paths.append(output_path)
                return GarminFitDownloadResult(
                    downloaded_paths=downloaded_paths,
                    skipped_existing_paths=skipped_existing_paths,
                    deleted_existing_paths=[],
                    inspected_activity_count=inspected_activity_count,
                )

            fit_bytes = download_activity_fit_bytes(api, activity_id)
            downloaded_paths.append(store.write(activity_id, fit_bytes))
            existing_activity_ids.add(activity_id)

            if inspected_activity_count >= limit:
                break

        if len(activities) < page_limit:
            break

        start += len(activities)

    return GarminFitDownloadResult(
        downloaded_paths=downloaded_paths,
        skipped_existing_paths=skipped_existing_paths,
        deleted_existing_paths=[],
        inspected_activity_count=inspected_activity_count,
    )


def download_incremental_running_fit_files(
    api: Garmin,
    output_dir: Path,
    limit: int = 200,
    page_size: int = 50,
) -> GarminFitDownloadResult:
    return download_incremental_running_fit_files_to_store(
        api=api,
        store=LocalGarminFitStore(output_dir),
        limit=limit,
        page_size=page_size,
    )


def overwrite_running_fit_files_for_range_to_store(
    api: Garmin,
    store: GarminFitStore,
    start_date: date,
    end_date: date,
) -> GarminFitDownloadResult:
    if end_date < start_date:
        raise ValueError("end_date must be on or after start_date.")

    deleted_existing_paths = store.delete_existing_fit_files()

    raw_activities = api.get_activities_by_date(
        start_date.isoformat(),
        end_date.isoformat(),
        activitytype="running",
    )
    activities = filter_activities_in_range(
        normalize_activities(raw_activities),
        start_date,
        end_date,
    )

    downloaded_paths: list[FitFileLocation] = []

    for activity in activities:
        activity_id = activity_id_as_str(activity)

        if activity_id is None:
            continue

        fit_bytes = download_activity_fit_bytes(api, activity_id)
        downloaded_paths.append(store.write(activity_id, fit_bytes))

    return GarminFitDownloadResult(
        downloaded_paths=downloaded_paths,
        skipped_existing_paths=[],
        deleted_existing_paths=deleted_existing_paths,
        inspected_activity_count=len(activities),
    )


def overwrite_running_fit_files_for_range(
    api: Garmin,
    output_dir: Path,
    start_date: date,
    end_date: date,
) -> GarminFitDownloadResult:
    return overwrite_running_fit_files_for_range_to_store(
        api=api,
        store=LocalGarminFitStore(output_dir),
        start_date=start_date,
        end_date=end_date,
    )


def download_running_fit_files(
    api: Garmin,
    output_dir: Path,
    limit: int = 50,
    since: date | None = None,
    overwrite: bool = False,
) -> GarminFitDownloadResult:
    end_date = date.today()

    if since is None and not overwrite:
        return download_incremental_running_fit_files(
            api=api,
            output_dir=output_dir,
            limit=limit,
        )

    start_date = since or one_year_ago(end_date)

    return overwrite_running_fit_files_for_range(
        api=api,
        output_dir=output_dir,
        start_date=start_date,
        end_date=end_date,
    )
