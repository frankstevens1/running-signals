#!/usr/bin/env python3

from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path
from typing import Callable, TypeVar

from garminconnect import (
    GarminConnectAuthenticationError,
    GarminConnectConnectionError,
    GarminConnectTooManyRequestsError,
)

from ingest.garmin.client import get_garmin_client
from ingest.garmin.download import (
    download_running_fit_files,
    one_year_ago,
    parse_since_arg,
)
from ingest.garmin.paths import get_garmin_fit_dir

T = TypeVar("T")


def format_since(value: date | None) -> str:
    if value is None:
        return "all"

    return value.isoformat()


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


def parse_path(value: str) -> Path:
    return Path(value).expanduser()


def parse_bool(value: str) -> bool:
    normalized = value.strip().lower()

    if normalized in {"y", "yes", "true", "1", "on"}:
        return True

    if normalized in {"n", "no", "false", "0", "off"}:
        return False

    raise ValueError("enter yes or no.")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download Garmin running activities as raw FIT files."
    )

    parser.add_argument(
        "--tokenstore",
        default="~/.garminconnect",
        help="Garmin token path. Defaults to ~/.garminconnect.",
    )

    parser.add_argument(
        "--output-dir",
        type=parse_path,
        default=get_garmin_fit_dir(),
        help="Directory to save extracted FIT files.",
    )

    parser.add_argument(
        "--limit",
        type=parse_limit,
        default=50,
        help="Number of recent running activities to fetch before filtering.",
    )

    parser.add_argument(
        "--since",
        type=parse_since_arg,
        default=one_year_ago(),
        metavar="YYYY-MM-DD|DAYS|all",
        help="Download activities on or after this date. Defaults to one year ago.",
    )

    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Re-download FIT files even if they already exist locally.",
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

    if should_prompt(args, argv):
        args = prompt_for_args(args)

    return args


def should_prompt(args: argparse.Namespace, argv: list[str] | None) -> bool:
    if args.interactive is not None:
        return bool(args.interactive)

    provided_args = sys.argv[1:] if argv is None else argv

    return not provided_args and sys.stdin.isatty() and sys.stdout.isatty()


def prompt_for_args(args: argparse.Namespace) -> argparse.Namespace:
    print("Garmin FIT download options. Press Enter to keep the shown value.")

    args.tokenstore = prompt_value("Token store", args.tokenstore, str)
    args.output_dir = prompt_value("Output directory", args.output_dir, parse_path)
    args.limit = prompt_value("Recent running activities to inspect", args.limit, parse_limit)
    args.since = prompt_value("Since date, days, or all", args.since, parse_since_arg, format_since)
    args.overwrite = prompt_value("Overwrite existing FIT files", args.overwrite, parse_bool)

    return args


def print_download_options(args: argparse.Namespace) -> None:
    print("Download options:")
    print(f"  tokenstore: {args.tokenstore}")
    print(f"  output_dir: {args.output_dir}")
    print(f"  limit: {args.limit}")
    print(f"  since: {format_since(args.since)}")
    print(f"  overwrite: {args.overwrite}")


def main() -> None:
    args = parse_args()
    print_download_options(args)

    api = get_garmin_client(args.tokenstore)

    saved_paths = download_running_fit_files(
        api=api,
        output_dir=args.output_dir,
        limit=args.limit,
        since=args.since,
        overwrite=args.overwrite,
    )

    print(f"Saved or found {len(saved_paths)} FIT files in {args.output_dir}")


if __name__ == "__main__":
    try:
        main()
    except (
        GarminConnectAuthenticationError,
        GarminConnectConnectionError,
        GarminConnectTooManyRequestsError,
    ) as exc:
        raise SystemExit(f"Garmin download failed: {exc}") from exc
