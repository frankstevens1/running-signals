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


def resolve_tokenstore_path(tokenstore: str | Path) -> Path:
    tokenstore_path = Path(tokenstore).expanduser()

    if not tokenstore_path.is_absolute():
        tokenstore_path = Path.cwd() / tokenstore_path

    tokenstore_path = tokenstore_path.resolve()
    project_root = get_project_root().resolve()

    if tokenstore_path == project_root or project_root in tokenstore_path.parents:
        raise ValueError(
            "Garmin token store must be outside the repository. "
            "Use the default ~/.garminconnect path or pass an absolute path outside the project."
        )

    return tokenstore_path


def try_login_with_tokens(tokenstore: str | Path) -> Garmin | None:
    tokenstore_path = resolve_tokenstore_path(tokenstore)

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


def get_garmin_client(
    tokenstore: str | Path = "~/.garminconnect",
    *,
    allow_prompt: bool = True,
) -> Garmin:
    load_dotenv(get_project_root() / ".env")
    tokenstore_path = resolve_tokenstore_path(tokenstore)

    api = try_login_with_tokens(tokenstore_path)
    if api is not None:
        return api

    email = os.getenv("GARMIN_EMAIL")
    password = os.getenv("GARMIN_PASSWORD")

    if not allow_prompt and (not email or not password):
        raise GarminConnectAuthenticationError(
            "Missing Garmin credentials. Provide a valid token store or set GARMIN_EMAIL and "
            "GARMIN_PASSWORD for non-interactive runs."
        )

    email = email or input("Garmin email: ").strip()
    password = password or getpass("Garmin password: ")

    if not email or not password:
        raise GarminConnectAuthenticationError("Missing Garmin credentials.")

    api = Garmin(email=email, password=password)
    api.login(str(tokenstore_path))

    return api
