#!/usr/bin/env python3

from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from ingest.garmin.paths import get_garmin_fit_dir, get_project_root


def load_project_env() -> None:
    load_dotenv(get_project_root() / ".env")


def parse_path(value: str) -> Path:
    return Path(value).expanduser()


def parse_limit(value: str) -> int:
    limit = int(value)

    if limit <= 0:
        raise ValueError("limit must be greater than 0.")

    return limit


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    load_project_env()

    parser = argparse.ArgumentParser(
        description="Extract Garmin FIT files from S3 to the local filesystem."
    )

    parser.add_argument(
        "--bucket",
        default=os.getenv("GARMIN_FIT_S3_BUCKET"),
        help="S3 bucket to read from. Defaults to GARMIN_FIT_S3_BUCKET.",
    )

    parser.add_argument(
        "--prefix",
        default=os.getenv("GARMIN_FIT_S3_PREFIX", "garmin/fit"),
        help="S3 prefix to read from. Defaults to GARMIN_FIT_S3_PREFIX or garmin/fit.",
    )

    parser.add_argument(
        "--output-dir",
        type=parse_path,
        default=get_garmin_fit_dir(),
        help="Local directory to write FIT files into. Defaults to data/raw/garmin/fit.",
    )

    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Re-download FIT files that already exist locally. Defaults to skipping them.",
    )

    parser.add_argument(
        "--limit",
        type=parse_limit,
        default=None,
        help="Stop after downloading this many missing FIT files. Useful for spot checks.",
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List S3 objects and report what would be downloaded without writing anything.",
    )

    args = parser.parse_args(argv)

    if not args.bucket:
        parser.error("--bucket is required unless GARMIN_FIT_S3_BUCKET is set.")

    return args


def get_s3_client() -> object:
    try:
        import boto3
    except ImportError as exc:
        raise ImportError(
            "boto3 is required. Install project dependencies first."
        ) from exc

    resolved_region_name = os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION")
    return boto3.client("s3", region_name=resolved_region_name)


def normalize_prefix(prefix: str) -> str:
    return "/".join(part for part in prefix.strip().split("/") if part)


def list_fit_keys(client: Any, bucket: str, prefix: str) -> list[str]:
    normalized_prefix = normalize_prefix(prefix)
    paginator = client.get_paginator("list_objects_v2")
    paginate_args: dict[str, str] = {"Bucket": bucket}

    if normalized_prefix:
        paginate_args["Prefix"] = normalized_prefix

    keys: list[str] = []

    for page in paginator.paginate(**paginate_args):
        for item in page.get("Contents", []):
            key = item.get("Key")

            if isinstance(key, str) and key.endswith(".fit"):
                keys.append(key)

    return keys


def download_key(client: Any, bucket: str, key: str, output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    filename = key.rsplit("/", maxsplit=1)[-1]
    output_path = output_dir / filename
    client.download_file(Bucket=bucket, Key=key, Filename=str(output_path))
    return output_path


def print_summary(downloaded: list[str], skipped: list[str], total: int) -> None:
    print(f"Found {total} FIT files in S3.")
    print(f"Downloaded {len(downloaded)} FIT files.")

    if skipped:
        print(f"Skipped {len(skipped)} FIT files already present locally.")


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    client = get_s3_client()

    prefix = normalize_prefix(args.prefix)
    print(f"S3 source: s3://{args.bucket}/{prefix}/")
    print(f"Local destination: {args.output_dir}")
    print(f"Mode: {'dry-run' if args.dry_run else 'download'}")

    keys = list_fit_keys(client, bucket=args.bucket, prefix=prefix)
    downloaded: list[str] = []
    skipped: list[str] = []

    for key in keys:
        filename = key.rsplit("/", maxsplit=1)[-1]
        output_path = args.output_dir / filename

        if output_path.exists() and not args.overwrite:
            skipped.append(key)
            continue

        if args.dry_run:
            downloaded.append(key)
            continue

        download_key(client, bucket=args.bucket, key=key, output_dir=args.output_dir)
        downloaded.append(key)
        print(f"Downloaded {key}")

        if args.limit is not None and len(downloaded) >= args.limit:
            print(f"Reached --limit {args.limit}. Stopping early.")
            break

    print_summary(downloaded, skipped, total=len(keys))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (FileNotFoundError, ValueError) as exc:
        raise SystemExit(f"FIT extraction failed: {exc}") from exc
