from __future__ import annotations

import fcntl
import json
import os
import tempfile
import uuid
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal, TextIO

StageStatus = Literal["pending", "running", "succeeded", "failed", "skipped"]


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def elapsed_seconds(started_at: str | None, completed_at: str | None) -> float | None:
    if started_at is None or completed_at is None:
        return None

    started = datetime.fromisoformat(started_at)
    completed = datetime.fromisoformat(completed_at)
    return max(0.0, round((completed - started).total_seconds(), 3))


def get_state_dir() -> Path:
    configured = os.getenv("XDG_STATE_HOME")
    base = Path(configured).expanduser() if configured else Path.home() / ".local" / "state"
    return base / "running-signals"


class RefreshLockHeldError(RuntimeError):
    """Raised when another local process already owns the refresh lock."""


class RefreshLock:
    def __init__(self, state_dir: Path) -> None:
        self._state_dir = state_dir
        self._handle: TextIO | None = None

    def __enter__(self) -> RefreshLock:
        self._state_dir.mkdir(parents=True, exist_ok=True)
        self._handle = (self._state_dir / "refresh.lock").open("a+", encoding="utf-8")

        try:
            fcntl.flock(self._handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            self._handle.close()
            self._handle = None
            raise RefreshLockHeldError("Another running-signals refresh is already in progress.") from exc

        return self

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
        if self._handle is None:
            return

        fcntl.flock(self._handle.fileno(), fcntl.LOCK_UN)
        self._handle.close()
        self._handle = None


@dataclass
class StageResult:
    status: StageStatus = "pending"
    started_at: str | None = None
    completed_at: str | None = None
    duration_seconds: float | None = None
    details: dict[str, Any] = field(default_factory=dict)
    error: str | None = None


@dataclass
class RunManifest:
    run_id: str
    command: str
    options: dict[str, Any]
    started_at: str
    completed_at: str | None = None
    duration_seconds: float | None = None
    status: StageStatus = "running"
    stages: dict[str, StageResult] = field(default_factory=dict)

    @classmethod
    def create(cls, command: str, options: dict[str, Any]) -> RunManifest:
        return cls(
            run_id=str(uuid.uuid4()),
            command=command,
            options=options,
            started_at=utc_now(),
        )

    def start_stage(self, name: str, details: dict[str, Any] | None = None) -> None:
        self.stages[name] = StageResult(
            status="running",
            started_at=utc_now(),
            details=details or {},
        )

    def finish_stage(
        self,
        name: str,
        status: Literal["succeeded", "failed", "skipped"],
        *,
        details: dict[str, Any] | None = None,
        error: str | None = None,
    ) -> None:
        stage = self.stages.setdefault(name, StageResult())
        stage.status = status
        stage.completed_at = utc_now()
        stage.duration_seconds = elapsed_seconds(stage.started_at, stage.completed_at)
        if details is not None:
            stage.details = details
        stage.error = error

    def finish(self, status: Literal["succeeded", "failed"]) -> None:
        self.status = status
        self.completed_at = utc_now()
        self.duration_seconds = elapsed_seconds(self.started_at, self.completed_at)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def manifest_path(state_dir: Path, run_id: str) -> Path:
    return state_dir / f"{run_id}.json"


def write_manifest(state_dir: Path, manifest: RunManifest) -> Path:
    state_dir.mkdir(parents=True, exist_ok=True)
    destination = manifest_path(state_dir, manifest.run_id)

    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=state_dir,
        prefix=f".{manifest.run_id}.",
        suffix=".tmp",
        delete=False,
    ) as temporary:
        json.dump(manifest.to_dict(), temporary, indent=2, sort_keys=True)
        temporary.write("\n")
        temporary_path = Path(temporary.name)

    temporary_path.replace(destination)
    return destination


def load_manifest(state_dir: Path, run_id: str) -> dict[str, Any]:
    path = manifest_path(state_dir, run_id)

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ValueError(f"No run manifest exists for {run_id}.") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"Run manifest for {run_id} is invalid JSON.") from exc

    if not isinstance(data, dict):
        raise ValueError(f"Run manifest for {run_id} must contain a JSON object.")

    return data
