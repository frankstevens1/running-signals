from __future__ import annotations

from pathlib import Path

import pytest

from ingest.garmin.client import resolve_tokenstore_path


def test_tokenstore_path_inside_repository_is_rejected() -> None:
    with pytest.raises(ValueError, match="outside the repository"):
        resolve_tokenstore_path("1")


def test_default_tokenstore_path_resolves_outside_repository() -> None:
    tokenstore_path = resolve_tokenstore_path("~/.garminconnect")

    assert tokenstore_path == (Path.home() / ".garminconnect").resolve()
