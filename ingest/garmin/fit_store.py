from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Protocol, Sequence

FitFileLocation = Path | str


class GarminFitStore(Protocol):
    def list_activity_ids(self) -> set[str]:
        """Return Garmin activity ids already present in the store."""

    def location_for_activity_id(self, activity_id: str) -> FitFileLocation:
        """Return the local path or object URI for an activity FIT file."""

    def exists(self, activity_id: str) -> bool:
        """Return whether the activity FIT file exists."""

    def write(self, activity_id: str, fit_bytes: bytes) -> FitFileLocation:
        """Write FIT bytes and return the resulting location."""

    def delete_existing_fit_files(self) -> Sequence[FitFileLocation]:
        """Delete existing FIT files in the configured store scope."""


def normalize_s3_prefix(prefix: str) -> str:
    return "/".join(part for part in prefix.strip().split("/") if part)


def build_s3_fit_key(activity_id: str, prefix: str = "garmin/fit") -> str:
    normalized_activity_id = str(activity_id).strip()

    if not normalized_activity_id:
        raise ValueError("activity_id must not be empty.")

    if "/" in normalized_activity_id:
        raise ValueError("activity_id must not contain '/'.")

    normalized_prefix = normalize_s3_prefix(prefix)

    if not normalized_prefix:
        return f"{normalized_activity_id}.fit"

    return f"{normalized_prefix}/{normalized_activity_id}.fit"


class LocalGarminFitStore:
    def __init__(self, output_dir: Path) -> None:
        self.output_dir = output_dir

    def list_activity_ids(self) -> set[str]:
        if not self.output_dir.exists():
            return set()

        return {path.stem for path in self.output_dir.glob("*.fit") if path.is_file()}

    def location_for_activity_id(self, activity_id: str) -> Path:
        return self.output_dir / f"{activity_id}.fit"

    def exists(self, activity_id: str) -> bool:
        return self.location_for_activity_id(activity_id).exists()

    def write(self, activity_id: str, fit_bytes: bytes) -> Path:
        self.output_dir.mkdir(parents=True, exist_ok=True)
        output_path = self.location_for_activity_id(activity_id)
        output_path.write_bytes(fit_bytes)
        return output_path

    def delete_existing_fit_files(self) -> list[Path]:
        if not self.output_dir.exists():
            return []

        deleted_paths: list[Path] = []

        for path in sorted(self.output_dir.glob("*.fit")):
            if not path.is_file():
                continue

            path.unlink()
            deleted_paths.append(path)

        return deleted_paths


class S3GarminFitStore:
    def __init__(
        self,
        bucket: str,
        prefix: str = "garmin/fit",
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

        resolved_region_name = region_name or os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION")
        return boto3.client("s3", region_name=resolved_region_name)

    def key_for_activity_id(self, activity_id: str) -> str:
        return build_s3_fit_key(activity_id=activity_id, prefix=self.prefix)

    def location_for_activity_id(self, activity_id: str) -> str:
        return f"s3://{self.bucket}/{self.key_for_activity_id(activity_id)}"

    def list_activity_ids(self) -> set[str]:
        activity_ids: set[str] = set()

        for key in self._list_fit_keys():
            filename = key.rsplit("/", maxsplit=1)[-1]
            activity_ids.add(filename.removesuffix(".fit"))

        return activity_ids

    def exists(self, activity_id: str) -> bool:
        return self.key_for_activity_id(activity_id) in set(self._list_fit_keys())

    def write(self, activity_id: str, fit_bytes: bytes) -> str:
        key = self.key_for_activity_id(activity_id)
        self.client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=fit_bytes,
            ContentType="application/octet-stream",
        )
        return f"s3://{self.bucket}/{key}"

    def delete_existing_fit_files(self) -> list[str]:
        if not self.prefix:
            raise ValueError("Refusing to delete S3 FIT files because the configured prefix is empty.")

        deleted_locations: list[str] = []
        keys = sorted(self._list_fit_keys())

        for start in range(0, len(keys), 1000):
            batch = keys[start : start + 1000]

            if not batch:
                continue

            self.client.delete_objects(
                Bucket=self.bucket,
                Delete={"Objects": [{"Key": key} for key in batch]},
            )
            deleted_locations.extend(f"s3://{self.bucket}/{key}" for key in batch)

        return deleted_locations

    def _list_fit_keys(self) -> list[str]:
        paginator = self.client.get_paginator("list_objects_v2")
        prefix = f"{self.prefix}/" if self.prefix else ""
        paginate_args: dict[str, str] = {"Bucket": self.bucket}

        if prefix:
            paginate_args["Prefix"] = prefix

        keys: list[str] = []

        for page in paginator.paginate(**paginate_args):
            for item in page.get("Contents", []):
                key = item.get("Key")

                if isinstance(key, str) and key.endswith(".fit"):
                    keys.append(key)

        return keys
