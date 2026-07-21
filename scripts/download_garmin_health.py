#!/usr/bin/env python3

from __future__ import annotations

import argparse
import os
import sys
from datetime import date
from pathlib import Path
from typing import Callable, Literal, TypeVar

from dotenv import load_dotenv
from garminconnect import (
    GarminConnectAuthenticationError,
    GarminConnectConnectionError,
    GarminConnectTooManyRequestsError,
)

from ingest.garmin.client import get_garmin_client
from ingest.garmin.health_download import (
    GarminHealthDownloadResult,
    download_daily_health_payloads_to_store,
    download_incremental_daily_health_payloads_to_store,
)
from ingest.garmin.health_store import (
    DEFAULT_HEALTH_S3_PREFIX,
    GarminHealthStore,
    LocalGarminHealthStore,
    S3GarminHealthStore,
)
from ingest.garmin.paths import get_garmin_health_dir, get_project_root

T = TypeVar("T")
DownloadMode = Literal["incremental", "range-overwrite"]
DownloadDestination = Literal["local", "s3"]


def load_project_env() -> None:
    load_dotenv(get_project_root() / ".env")


def parse_date_arg(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("date must be YYYY-MM-DD.") from exc


def parse_optional_date_arg(value: str) -> date | None:
    normalized = value.strip().lower()

    if normalized in {"auto", "none", "default"}:
        return None

    return parse_date_arg(value)


def format_optional_date(value: date | None) -> str:
    if value is None:
        return "auto"

    return value.isoformat()


def parse_path(value: str) -> Path:
    return Path(value).expanduser()


def parse_download_mode(value: str) -> DownloadMode:
    normalized = value.strip().lower()

    if normalized in {"1", "incremental", "incremental-refresh", "refresh"}:
        return "incremental"

    if normalized in {"2", "range", "range-overwrite", "overwrite"}:
        return "range-overwrite"

    raise ValueError("mode must be incremental or range-overwrite.")


def parse_destination(value: str) -> DownloadDestination:
    normalized = value.strip().lower()

    if normalized in {"local", "filesystem", "file"}:
        return "local"

    if normalized in {"s3", "aws-s3"}:
        return "s3"

    raise ValueError("destination must be local or s3.")


def prompt_value(
    label: str,
    current: T,
    parse: Callable[[str], T],
    format_current: Callable[[T], str] = str,
) -> T:
    current_text = format_current(current)

    while True:
        value = input(f"{label} [{current_text}]: ").strip()

        if not value:
            return current

        try:
            return parse(value)
        except ValueError as exc:
            print(f"Invalid value: {exc}")


def prompt_download_mode(current: DownloadMode) -> DownloadMode:
    current_text = str(current)

    while True:
        value = input(
            "Download mode ["
            f"{current_text}"
            "] (1 incremental, 2 range-overwrite): "
        ).strip()

        if not value:
            return current

        try:
            return parse_download_mode(value)
        except ValueError as exc:
            print(f"Invalid value: {exc}")


def prompt_destination(current: DownloadDestination) -> DownloadDestination:
    current_text = str(current)

    while True:
        value = input(f"Destination [{current_text}] (local or s3): ").strip()

        if not value:
            return current

        try:
            return parse_destination(value)
        except ValueError as exc:
            print(f"Invalid value: {exc}")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    load_project_env()

    parser = argparse.ArgumentParser(
        description="Download daily Garmin health API payloads as raw JSON."
    )

    parser.add_argument(
        "--tokenstore",
        default="~/.garminconnect",
        help="Garmin token path. Defaults to ~/.garminconnect.",
    )

    parser.add_argument(
        "--destination",
        choices=["local", "s3"],
        default="s3",
        help="Where to save downloaded health JSON files. Defaults to s3 (S3-compatible object storage).",
    )

    parser.add_argument(
        "--output-dir",
        type=parse_path,
        default=get_garmin_health_dir(),
        help="Directory to save health JSON files when --destination local.",
    )

    parser.add_argument(
        "--s3-bucket",
        default=os.getenv("GARMIN_HEALTH_S3_BUCKET") or os.getenv("GARMIN_FIT_S3_BUCKET"),
        help=(
            "S3 bucket for health JSON files. Defaults to GARMIN_HEALTH_S3_BUCKET, "
            "then GARMIN_FIT_S3_BUCKET. "
            "Credentials read from OBJECT_STORAGE_ACCESS_KEY_ID, "
            "OBJECT_STORAGE_SECRET_ACCESS_KEY, and OBJECT_STORAGE_ENDPOINT_URL."
        ),
    )

    parser.add_argument(
        "--s3-prefix",
        default=os.getenv("GARMIN_HEALTH_S3_PREFIX", DEFAULT_HEALTH_S3_PREFIX),
        help=(
            "S3 prefix for health JSON files. Defaults to GARMIN_HEALTH_S3_PREFIX "
            f"or {DEFAULT_HEALTH_S3_PREFIX}."
        ),
    )

    parser.add_argument(
        "--mode",
        choices=["incremental", "range-overwrite"],
        default="incremental",
        help=(
            "Download mode. incremental writes only missing health payloads. "
            "range-overwrite re-fetches the requested date range."
        ),
    )

    parser.add_argument(
        "--start-date",
        type=parse_optional_date_arg,
        default=None,
        metavar="YYYY-MM-DD|auto",
        help=(
            "Health payload start date. In incremental mode, defaults to the latest "
            "existing payload date, or today when the destination is empty."
        ),
    )

    parser.add_argument(
        "--end-date",
        type=parse_date_arg,
        default=date.today(),
        metavar="YYYY-MM-DD",
        help="Health payload end date. Defaults to today.",
    )

    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Legacy alias for --mode range-overwrite.",
    )

    parser.add_argument(
        "--interactive",
        action="store_true",
        default=None,
        help="Prompt for download options before connecting to Garmin.",
    )

    parser.add_argument(
        "--no-interactive",
        action="store_false",
        dest="interactive",
        help="Use argument/default values without prompting.",
    )

    args = parser.parse_args(argv)
    reconcile_args(args)

    if should_prompt(args, argv):
        args = prompt_for_args(args)

    validate_args(parser, args)
    return args


def reconcile_args(args: argparse.Namespace) -> None:
    if args.overwrite:
        args.mode = "range-overwrite"

    if args.mode == "range-overwrite" and args.start_date is None:
        args.start_date = date.today()


def should_prompt(args: argparse.Namespace, argv: list[str] | None) -> bool:
    if args.interactive is not None:
        return bool(args.interactive)

    provided_args = sys.argv[1:] if argv is None else argv
    return not provided_args and sys.stdin.isatty() and sys.stdout.isatty()


def prompt_for_args(args: argparse.Namespace) -> argparse.Namespace:
    print("Garmin health download options. Press Enter to keep the shown value.")

    args.mode = prompt_download_mode(args.mode)
    args.destination = prompt_destination(args.destination)
    args.tokenstore = prompt_value("Token store", args.tokenstore, str)

    if args.destination == "local":
        args.output_dir = prompt_value("Output directory", args.output_dir, parse_path)
    else:
        args.s3_bucket = prompt_value("S3 bucket", args.s3_bucket or "", str)
        args.s3_prefix = prompt_value("S3 prefix", args.s3_prefix, str)

    if args.mode == "incremental":
        args.start_date = prompt_value(
            "Start date",
            args.start_date,
            parse_optional_date_arg,
            format_optional_date,
        )
    else:
        if args.start_date is None:
            args.start_date = date.today()

        args.start_date = prompt_value("Start date", args.start_date, parse_date_arg)

    args.end_date = prompt_value("End date", args.end_date, parse_date_arg)

    return args


def validate_args(parser: argparse.ArgumentParser, args: argparse.Namespace) -> None:
    if args.mode == "range-overwrite" and args.start_date is None:
        parser.error("--start-date is required when --mode range-overwrite.")

    if args.start_date is not None and args.end_date < args.start_date:
        parser.error("--end-date must be on or after --start-date.")

    if args.destination == "s3" and not args.s3_bucket:
        parser.error(
            "--s3-bucket is required when --destination s3 unless GARMIN_HEALTH_S3_BUCKET "
            "or GARMIN_FIT_S3_BUCKET is set."
        )


def print_download_options(args: argparse.Namespace) -> None:
    print("Download options:")
    print(f"  mode: {args.mode}")
    print(f"  destination: {args.destination}")
    print(f"  tokenstore: {args.tokenstore}")
    print(f"  start_date: {format_optional_date(args.start_date)}")
    print(f"  end_date: {args.end_date.isoformat()}")

    if args.destination == "local":
        print(f"  output_dir: {args.output_dir}")
    else:
        print(f"  s3_bucket: {args.s3_bucket}")
        print(f"  s3_prefix: {args.s3_prefix}")


def print_download_result(result: GarminHealthDownloadResult) -> None:
    print(f"Inspected {result.inspected_day_count} Garmin health days.")
    print(f"Wrote {len(result.written_paths)} health JSON payloads.")

    if result.skipped_existing_paths:
        print(f"Skipped {len(result.skipped_existing_paths)} existing health JSON payloads.")

    if result.endpoint_failures:
        print(f"Endpoint failures: {len(result.endpoint_failures)}")
        for failure in result.endpoint_failures:
            print(
                "  "
                f"{failure.calendar_date.isoformat()} {failure.payload_type} "
                f"{failure.error_type}: {failure.error_message}"
            )


def main() -> None:
    args = parse_args()
    print_download_options(args)

    api = get_garmin_client(args.tokenstore)

    if args.destination == "s3":
        store: GarminHealthStore = S3GarminHealthStore(
            bucket=args.s3_bucket,
            prefix=args.s3_prefix,
        )
    else:
        store = LocalGarminHealthStore(args.output_dir)

    if args.mode == "incremental":
        result = download_incremental_daily_health_payloads_to_store(
            api=api,
            store=store,
            start_date=args.start_date,
            end_date=args.end_date,
        )
    else:
        result = download_daily_health_payloads_to_store(
            api=api,
            store=store,
            start_date=args.start_date,
            end_date=args.end_date,
        )

    print_download_result(result)


if __name__ == "__main__":
    try:
        main()
    except (
        GarminConnectAuthenticationError,
        GarminConnectConnectionError,
        GarminConnectTooManyRequestsError,
        FileNotFoundError,
        ValueError,
    ) as exc:
        raise SystemExit(f"Garmin health download failed: {exc}") from exc
