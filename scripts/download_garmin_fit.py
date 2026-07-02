#!/usr/bin/env python3

from __future__ import annotations

import argparse
import os
import sys
from datetime import date
from pathlib import Path
from typing import Callable, Literal, TypeVar

from garminconnect import (
    GarminConnectAuthenticationError,
    GarminConnectConnectionError,
    GarminConnectTooManyRequestsError,
)
from dotenv import load_dotenv

from ingest.garmin.client import get_garmin_client
from ingest.garmin.download import (
    GarminFitDownloadResult,
    download_incremental_running_fit_files,
    download_incremental_running_fit_files_to_store,
    one_year_ago,
    overwrite_running_fit_files_for_range,
    overwrite_running_fit_files_for_range_to_store,
    parse_since_arg,
)
from ingest.garmin.fit_store import S3GarminFitStore
from ingest.garmin.paths import get_garmin_fit_dir, get_project_root

T = TypeVar("T")
DownloadMode = Literal["incremental", "range-overwrite"]
DownloadDestination = Literal["local", "s3"]


def load_project_env() -> None:
    load_dotenv(get_project_root() / ".env")


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


def parse_limit(value: str) -> int:
    limit = int(value)

    if limit <= 0:
        raise ValueError("limit must be greater than 0.")

    return limit


def parse_date_arg(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("date must be YYYY-MM-DD.") from exc


def parse_since_start_arg(value: str) -> date:
    start_date = parse_since_arg(value)

    if start_date is None:
        raise ValueError("--since all is not supported for range overwrite.")

    return start_date


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
        description="Download Garmin running activities as raw FIT files."
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
        help="Where to save downloaded FIT files. Defaults to s3.",
    )

    parser.add_argument(
        "--output-dir",
        type=parse_path,
        default=get_garmin_fit_dir(),
        help="Directory to save extracted FIT files when --destination local.",
    )

    parser.add_argument(
        "--s3-bucket",
        default=os.getenv("GARMIN_FIT_S3_BUCKET"),
        help="S3 bucket for FIT files. Defaults to GARMIN_FIT_S3_BUCKET.",
    )

    parser.add_argument(
        "--s3-prefix",
        default=os.getenv("GARMIN_FIT_S3_PREFIX", "garmin/fit"),
        help="S3 prefix for FIT files. Defaults to GARMIN_FIT_S3_PREFIX or garmin/fit.",
    )

    parser.add_argument(
        "--mode",
        choices=["incremental", "range-overwrite"],
        default="incremental",
        help=(
            "Download mode. incremental appends new runs to an existing FIT folder. "
            "range-overwrite deletes existing FIT files first, then downloads the date range."
        ),
    )

    parser.add_argument(
        "--limit",
        type=parse_limit,
        default=200,
        help="Maximum recent running activities to inspect in incremental mode.",
    )

    parser.add_argument(
        "--start-date",
        type=parse_date_arg,
        default=one_year_ago(),
        metavar="YYYY-MM-DD",
        help="Range-overwrite start date. Defaults to one year ago.",
    )

    parser.add_argument(
        "--end-date",
        type=parse_date_arg,
        default=date.today(),
        metavar="YYYY-MM-DD",
        help="Range-overwrite end date. Defaults to today.",
    )

    parser.add_argument(
        "--since",
        type=parse_since_start_arg,
        default=None,
        metavar="YYYY-MM-DD|DAYS",
        help="Legacy alias for --start-date when using --mode range-overwrite.",
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
    reconcile_args(parser, args)

    if should_prompt(args, argv):
        args = prompt_for_args(args)

    validate_args(parser, args)

    return args


def reconcile_args(parser: argparse.ArgumentParser, args: argparse.Namespace) -> None:
    if args.overwrite:
        args.mode = "range-overwrite"

    if args.since is None:
        return

    if args.mode != "range-overwrite":
        parser.error("--since only applies with --mode range-overwrite or --overwrite.")

    args.start_date = args.since


def should_prompt(args: argparse.Namespace, argv: list[str] | None) -> bool:
    if args.interactive is not None:
        return bool(args.interactive)

    provided_args = sys.argv[1:] if argv is None else argv

    return not provided_args and sys.stdin.isatty() and sys.stdout.isatty()


def prompt_for_args(args: argparse.Namespace) -> argparse.Namespace:
    print("Garmin FIT download options. Press Enter to keep the shown value.")

    args.mode = prompt_download_mode(args.mode)
    args.destination = prompt_destination(args.destination)
    args.tokenstore = prompt_value("Token store", args.tokenstore, str)

    if args.destination == "local":
        args.output_dir = prompt_value("Output directory", args.output_dir, parse_path)
    else:
        args.s3_bucket = prompt_value("S3 bucket", args.s3_bucket or "", str)
        args.s3_prefix = prompt_value("S3 prefix", args.s3_prefix, str)

    if args.mode == "incremental":
        args.limit = prompt_value("Recent running activities to inspect", args.limit, parse_limit)
    else:
        args.start_date = prompt_value("Start date", args.start_date, parse_date_arg)
        args.end_date = prompt_value("End date", args.end_date, parse_date_arg)

    return args


def validate_args(parser: argparse.ArgumentParser, args: argparse.Namespace) -> None:
    if args.mode == "range-overwrite" and args.end_date < args.start_date:
        parser.error("--end-date must be on or after --start-date.")

    if args.destination == "s3" and not args.s3_bucket:
        parser.error("--s3-bucket is required when --destination s3 unless GARMIN_FIT_S3_BUCKET is set.")


def print_download_options(args: argparse.Namespace) -> None:
    print("Download options:")
    print(f"  mode: {args.mode}")
    print(f"  destination: {args.destination}")
    print(f"  tokenstore: {args.tokenstore}")

    if args.destination == "local":
        print(f"  output_dir: {args.output_dir}")
    else:
        print(f"  s3_bucket: {args.s3_bucket}")
        print(f"  s3_prefix: {args.s3_prefix}")

    if args.mode == "incremental":
        print(f"  limit: {args.limit}")
    else:
        print(f"  start_date: {args.start_date.isoformat()}")
        print(f"  end_date: {args.end_date.isoformat()}")


def print_download_result(args: argparse.Namespace, result: GarminFitDownloadResult) -> None:
    print(f"Inspected {result.inspected_activity_count} Garmin running activities.")

    if result.deleted_existing_paths:
        print(f"Deleted {len(result.deleted_existing_paths)} existing FIT files.")

    print(f"Downloaded {len(result.downloaded_paths)} FIT files.")

    if result.skipped_existing_paths:
        print(f"Stopped at existing FIT file: {result.skipped_existing_paths[0]}")


def main() -> None:
    args = parse_args()
    print_download_options(args)

    api = get_garmin_client(args.tokenstore)

    if args.destination == "s3":
        store = S3GarminFitStore(bucket=args.s3_bucket, prefix=args.s3_prefix)

        if args.mode == "incremental":
            result = download_incremental_running_fit_files_to_store(
                api=api,
                store=store,
                limit=args.limit,
            )
        else:
            result = overwrite_running_fit_files_for_range_to_store(
                api=api,
                store=store,
                start_date=args.start_date,
                end_date=args.end_date,
            )
    elif args.mode == "incremental":
        result = download_incremental_running_fit_files(
            api=api,
            output_dir=args.output_dir,
            limit=args.limit,
        )
    else:
        result = overwrite_running_fit_files_for_range(
            api=api,
            output_dir=args.output_dir,
            start_date=args.start_date,
            end_date=args.end_date,
        )

    print_download_result(args, result)


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
        raise SystemExit(f"Garmin download failed: {exc}") from exc
