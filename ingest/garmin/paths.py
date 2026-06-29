from pathlib import Path


def get_project_root() -> Path:
    current = Path.cwd().resolve()

    for path in [current, *current.parents]:
        if (path / "pyproject.toml").exists():
            return path

    raise RuntimeError("Could not find project root. Expected pyproject.toml.")


def get_garmin_raw_dir() -> Path:
    path = get_project_root() / "data" / "raw" / "garmin"
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_garmin_fit_dir() -> Path:
    path = get_garmin_raw_dir() / "fit"
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_garmin_exploration_dir() -> Path:
    path = get_garmin_raw_dir() / "exploration"
    path.mkdir(parents=True, exist_ok=True)
    return path