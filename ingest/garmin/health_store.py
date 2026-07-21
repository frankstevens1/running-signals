from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any, Protocol

from ingest.garmin.fit_store import _default_s3_client, normalize_s3_prefix

HealthPayloadLocation = Path | str
HealthPayloadIdentity = tuple[date, str]

HEALTH_PAYLOAD_TYPES = ("hrv", "rhr", "sleep", "heart_rates")
DEFAULT_HEALTH_S3_PREFIX = "garmin/health/daily"


class GarminHealthStore(Protocol):
    def list_payloads(self) -> set[HealthPayloadIdentity]:
        """Return daily health payloads already present in the store."""

    def location_for_payload(self, calendar_date: date, payload_type: str) -> HealthPayloadLocation:
        """Return the local path or object URI for a daily health payload."""

    def exists(self, calendar_date: date, payload_type: str) -> bool:
        """Return whether a daily health payload exists."""

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


def parse_health_payload_relative_path(relative_path: str) -> HealthPayloadIdentity | None:
    parts = relative_path.split("/")

    if len(parts) != 2:
        return None

    date_part, filename = parts

    if not date_part.startswith("calendar_date=") or not filename.endswith(".json"):
        return None

    try:
        calendar_date = date.fromisoformat(date_part.removeprefix("calendar_date="))
        payload_type = validate_health_payload_type(filename.removesuffix(".json"))
    except ValueError:
        return None

    return calendar_date, payload_type


class LocalGarminHealthStore:
    def __init__(self, output_dir: Path) -> None:
        self.output_dir = output_dir

    def list_payloads(self) -> set[HealthPayloadIdentity]:
        if not self.output_dir.exists():
            return set()

        payloads: set[HealthPayloadIdentity] = set()

        for path in self.output_dir.glob("calendar_date=*/*.json"):
            if not path.is_file():
                continue

            identity = parse_health_payload_relative_path(
                f"{path.parent.name}/{path.name}"
            )

            if identity is not None:
                payloads.add(identity)

        return payloads

    def location_for_payload(self, calendar_date: date, payload_type: str) -> Path:
        return self.output_dir / build_health_payload_relative_path(calendar_date, payload_type)

    def exists(self, calendar_date: date, payload_type: str) -> bool:
        return self.location_for_payload(calendar_date, payload_type).exists()

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
        endpoint_url: str | None = None,
        access_key_id: str | None = None,
        secret_access_key: str | None = None,
        region_name: str | None = None,
    ) -> None:
        if not bucket.strip():
            raise ValueError("S3 bucket must not be empty.")

        self.bucket = bucket.strip()
        self.prefix = normalize_s3_prefix(prefix)
        self.client = client or _default_s3_client(
            endpoint_url=endpoint_url,
            access_key_id=access_key_id,
            secret_access_key=secret_access_key,
            region_name=region_name,
        )

    def key_for_payload(self, calendar_date: date, payload_type: str) -> str:
        return build_s3_health_key(
            calendar_date=calendar_date,
            payload_type=payload_type,
            prefix=self.prefix,
        )

    def list_payloads(self) -> set[HealthPayloadIdentity]:
        payloads: set[HealthPayloadIdentity] = set()
        prefix = f"{self.prefix}/" if self.prefix else ""

        for key in self._list_health_keys():
            relative_path = key.removeprefix(prefix)
            identity = parse_health_payload_relative_path(relative_path)

            if identity is not None:
                payloads.add(identity)

        return payloads

    def location_for_payload(self, calendar_date: date, payload_type: str) -> str:
        return f"s3://{self.bucket}/{self.key_for_payload(calendar_date, payload_type)}"

    def exists(self, calendar_date: date, payload_type: str) -> bool:
        return self.key_for_payload(calendar_date, payload_type) in set(self._list_health_keys())

    def write(self, calendar_date: date, payload_type: str, payload_json: str) -> str:
        key = self.key_for_payload(calendar_date, payload_type)
        self.client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=payload_json.encode("utf-8"),
            ContentType="application/json",
        )
        return f"s3://{self.bucket}/{key}"

    def _list_health_keys(self) -> list[str]:
        paginator = self.client.get_paginator("list_objects_v2")
        prefix = f"{self.prefix}/" if self.prefix else ""
        paginate_args: dict[str, str] = {"Bucket": self.bucket}

        if prefix:
            paginate_args["Prefix"] = prefix

        keys: list[str] = []

        for page in paginator.paginate(**paginate_args):
            for item in page.get("Contents", []):
                key = item.get("Key")

                if isinstance(key, str) and key.endswith(".json"):
                    keys.append(key)

        return keys
