from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any, Callable

from garminconnect import Garmin

from ingest.garmin.health_store import (
    GarminHealthStore,
    HealthPayloadLocation,
)


@dataclass(frozen=True)
class GarminHealthEndpoint:
    payload_type: str
    source_method: str
    fetch: Callable[[Garmin, date], Any]


@dataclass(frozen=True)
class GarminHealthEndpointFailure:
    calendar_date: date
    payload_type: str
    source_method: str
    error_type: str
    error_message: str


@dataclass(frozen=True)
class GarminHealthDownloadResult:
    written_paths: list[HealthPayloadLocation]
    endpoint_failures: list[GarminHealthEndpointFailure]
    inspected_day_count: int


HEALTH_ENDPOINTS = (
    GarminHealthEndpoint(
        payload_type="hrv",
        source_method="get_hrv_data",
        fetch=lambda api, calendar_date: api.get_hrv_data(calendar_date.isoformat()),
    ),
    GarminHealthEndpoint(
        payload_type="rhr",
        source_method="get_rhr_day",
        fetch=lambda api, calendar_date: api.get_rhr_day(calendar_date.isoformat()),
    ),
    GarminHealthEndpoint(
        payload_type="sleep",
        source_method="get_sleep_data",
        fetch=lambda api, calendar_date: api.get_sleep_data(calendar_date.isoformat()),
    ),
    GarminHealthEndpoint(
        payload_type="heart_rates",
        source_method="get_heart_rates",
        fetch=lambda api, calendar_date: api.get_heart_rates(calendar_date.isoformat()),
    ),
)


def iter_calendar_dates(start_date: date, end_date: date) -> list[date]:
    if end_date < start_date:
        raise ValueError("end_date must be on or after start_date.")

    day_count = (end_date - start_date).days + 1
    return [start_date + timedelta(days=offset) for offset in range(day_count)]


def build_health_payload_envelope(
    calendar_date: date,
    payload_type: str,
    source_method: str,
    payload: Any,
    fetched_at: datetime | None = None,
) -> dict[str, Any]:
    fetched_at = fetched_at or datetime.now(tz=UTC)

    return {
        "calendar_date": calendar_date.isoformat(),
        "payload_type": payload_type,
        "source_method": source_method,
        "fetched_at": fetched_at.isoformat(),
        "source_system": "garmin",
        "source_format": "json",
        "payload": payload,
    }


def health_payload_envelope_to_json(envelope: dict[str, Any]) -> str:
    return json.dumps(envelope, default=serialize_json_value, sort_keys=True)


def serialize_json_value(value: Any) -> str:
    if isinstance(value, datetime | date):
        return value.isoformat()

    return str(value)


def download_daily_health_payloads_to_store(
    api: Garmin,
    store: GarminHealthStore,
    start_date: date,
    end_date: date,
) -> GarminHealthDownloadResult:
    written_paths: list[HealthPayloadLocation] = []
    endpoint_failures: list[GarminHealthEndpointFailure] = []
    calendar_dates = iter_calendar_dates(start_date, end_date)

    for calendar_date in calendar_dates:
        for endpoint in HEALTH_ENDPOINTS:
            try:
                payload = endpoint.fetch(api, calendar_date)
            except Exception as exc:
                endpoint_failures.append(
                    GarminHealthEndpointFailure(
                        calendar_date=calendar_date,
                        payload_type=endpoint.payload_type,
                        source_method=endpoint.source_method,
                        error_type=type(exc).__name__,
                        error_message=str(exc),
                    )
                )
                continue

            envelope = build_health_payload_envelope(
                calendar_date=calendar_date,
                payload_type=endpoint.payload_type,
                source_method=endpoint.source_method,
                payload=payload,
            )
            payload_json = health_payload_envelope_to_json(envelope)
            written_paths.append(store.write(calendar_date, endpoint.payload_type, payload_json))

    return GarminHealthDownloadResult(
        written_paths=written_paths,
        endpoint_failures=endpoint_failures,
        inspected_day_count=len(calendar_dates),
    )
