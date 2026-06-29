import os
from getpass import getpass
from pathlib import Path

from dotenv import load_dotenv
from garminconnect import (
    Garmin,
    GarminConnectAuthenticationError,
    GarminConnectConnectionError,
)

from ingest.garmin.paths import get_project_root


def try_login_with_tokens(tokenstore: str | Path) -> Garmin | None:
    tokenstore_path = Path(tokenstore).expanduser()

    try:
        api = Garmin()
        api.login(str(tokenstore_path))
        return api
    except (
        FileNotFoundError,
        GarminConnectAuthenticationError,
        GarminConnectConnectionError,
    ):
        return None


def get_garmin_client(tokenstore: str | Path = "~/.garminconnect") -> Garmin:
    load_dotenv(get_project_root() / ".env")
    tokenstore_path = Path(tokenstore).expanduser()

    api = try_login_with_tokens(tokenstore_path)
    if api is not None:
        return api

    email = os.getenv("GARMIN_EMAIL") or input("Garmin email: ").strip()
    password = os.getenv("GARMIN_PASSWORD") or getpass("Garmin password: ")

    if not email or not password:
        raise GarminConnectAuthenticationError("Missing Garmin credentials.")

    api = Garmin(email=email, password=password)
    api.login(str(tokenstore_path))

    return api
