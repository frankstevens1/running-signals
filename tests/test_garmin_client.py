from __future__ import annotations

from pathlib import Path

import pytest

from garminconnect import GarminConnectAuthenticationError

from ingest.garmin import client
from ingest.garmin.client import resolve_tokenstore_path


def test_tokenstore_path_inside_repository_is_rejected() -> None:
    with pytest.raises(ValueError, match="outside the repository"):
        resolve_tokenstore_path("1")


def test_default_tokenstore_path_resolves_outside_repository() -> None:
    tokenstore_path = resolve_tokenstore_path("~/.garminconnect")

    assert tokenstore_path == (Path.home() / ".garminconnect").resolve()


def test_non_interactive_client_does_not_prompt_for_missing_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(client, "load_dotenv", lambda path: None)
    monkeypatch.setattr(client, "try_login_with_tokens", lambda tokenstore: None)
    monkeypatch.delenv("GARMIN_EMAIL", raising=False)
    monkeypatch.delenv("GARMIN_PASSWORD", raising=False)

    with pytest.raises(GarminConnectAuthenticationError, match="non-interactive"):
        client.get_garmin_client(allow_prompt=False)
