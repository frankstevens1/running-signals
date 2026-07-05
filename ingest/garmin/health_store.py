from __future__ import annotations

import os
from datetime import date
from pathlib import Path
from typing import Any, Protocol

from ingest.garmin.fit_store import normalize_s3_prefix

HealthPayloadLocation = Path | str

HEALTH_PAYLOAD_TYPES = ("hrv", "rhr", "sleep", "heart_rates")
DEFAULT_HEALTH_S3_PREFIX = "garmin/health/daily"


class GarminHealthStore(Protocol):
    def location_for_payload(self, calendar_date: date, payload_type: str) -> HealthPayloadLocation:
        """Return the local path or object URI for a daily health payload."""

    def write(self, calendar_date: date, payload_type: str, payload_json: str) -> HealthPayloadLocation:
        """Write a JSON health payload and return the resulting location."""


def validate_health_payload_type(payload_type: str) -> str:
    normalized = payload_type.strip().lower()

    if normalized not in HEALTH_PAYLOAD_TYPES:
        raise ValueError(
            "payload_type must be one of: " + ", ".join(HEALTH_PAYLOAD_TYPES)
        )

    return normalized


def build_health_payload_relative_path(calendar_date: date, payload_type: str) -> str:
    normalized_payload_type = validate_health_payload_type(payload_type)
    return f"calendar_date={calendar_date.isoformat()}/{normalized_payload_type}.json"


def build_s3_health_key(
    calendar_date: date,
    payload_type: str,
    prefix: str = DEFAULT_HEALTH_S3_PREFIX,
) -> str:
    normalized_prefix = normalize_s3_prefix(prefix)
    relative_path = build_health_payload_relative_path(calendar_date, payload_type)

    if not normalized_prefix:
        return relative_path

    return f"{normalized_prefix}/{relative_path}"


class LocalGarminHealthStore:
    def __init__(self, output_dir: Path) -> None:
        self.output_dir = output_dir

    def location_for_payload(self, calendar_date: date, payload_type: str) -> Path:
        return self.output_dir / build_health_payload_relative_path(calendar_date, payload_type)

    def write(self, calendar_date: date, payload_type: str, payload_json: str) -> Path:
        output_path = self.location_for_payload(calendar_date, payload_type)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(payload_json, encoding="utf-8")
        return output_path


class S3GarminHealthStore:
    def __init__(
        self,
        bucket: str,
        prefix: str = DEFAULT_HEALTH_S3_PREFIX,
        client: Any | None = None,
        region_name: str | None = None,
    ) -> None:
        if not bucket.strip():
            raise ValueError("S3 bucket must not be empty.")

        self.bucket = bucket.strip()
        self.prefix = normalize_s3_prefix(prefix)
        self.client = client or self._default_client(region_name)

    def _default_client(self, region_name: str | None) -> Any:
        try:
            import boto3
        except ImportError as exc:
            raise ImportError(
                "boto3 is required for --destination s3. Install project dependencies first."
            ) from exc

        resolved_region_name = region_name or os.getenv("AWS_REGION") or os.getenv(
            "AWS_DEFAULT_REGION"
        )
        return boto3.client("s3", region_name=resolved_region_name)

    def key_for_payload(self, calendar_date: date, payload_type: str) -> str:
        return build_s3_health_key(
            calendar_date=calendar_date,
            payload_type=payload_type,
            prefix=self.prefix,
        )

    def location_for_payload(self, calendar_date: date, payload_type: str) -> str:
        return f"s3://{self.bucket}/{self.key_for_payload(calendar_date, payload_type)}"

    def write(self, calendar_date: date, payload_type: str, payload_json: str) -> str:
        key = self.key_for_payload(calendar_date, payload_type)
        self.client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=payload_json.encode("utf-8"),
            ContentType="application/json",
        )
        return f"s3://{self.bucket}/{key}"
