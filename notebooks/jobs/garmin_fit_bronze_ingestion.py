# Databricks notebook source
# MAGIC %md
# MAGIC # Garmin FIT Bronze Ingestion
# MAGIC
# MAGIC This notebook is the Databricks job entrypoint for loading Garmin FIT files into the bronze Delta tables.
# MAGIC It is intentionally thin: parsing, validation, idempotency, and write behavior live in reusable Python code
# MAGIC under `ingest/garmin`.
# MAGIC
# MAGIC The associated exploration notebook is `notebooks/exploration/garmin_payload_exploration.ipynb`.
# MAGIC That notebook validates the Garmin FIT payload shape and field coverage; this notebook operationalizes the
# MAGIC stable ingestion path that came out of that exploration.
# MAGIC
# MAGIC ## Inputs
# MAGIC
# MAGIC - `source_path`: Databricks-accessible directory containing `.fit` files.
# MAGIC - `catalog`: Unity Catalog catalog for the bronze tables.
# MAGIC - `schema`: Target schema, normally `bronze`.
# MAGIC - `full_refresh`: Set to `true` only for an intentional table rebuild.
# MAGIC
# MAGIC The expected source path for the default development setup is an external S3-backed
# MAGIC Unity Catalog volume:
# MAGIC
# MAGIC ```text
# MAGIC /Volumes/running_signals/bronze/raw_garmin/fit
# MAGIC ```
# MAGIC
# MAGIC Each FIT filename stem is treated as both `run_id` and `garmin_activity_id`.

# COMMAND ----------

# MAGIC %md
# MAGIC ## Run Bronze Ingestion
# MAGIC
# MAGIC The ingestion function discovers new or changed FIT files, parses sessions/events/records, derives `run_date`
# MAGIC from the session `start_time`, validates required fields, and writes:
# MAGIC
# MAGIC - `bronze.garmin_fit_sessions`
# MAGIC - `bronze.garmin_fit_events`
# MAGIC - `bronze.garmin_fit_records`
# MAGIC
# MAGIC Re-running this notebook is safe. Existing unchanged files are skipped, and changed files are replaced by
# MAGIC `run_id` across all three bronze tables.

# COMMAND ----------

import sys
from pathlib import Path


def add_bundle_source_root_to_python_path() -> None:
    candidate_roots: list[str] = []
    dbutils_value = globals().get("dbutils")

    if dbutils_value is not None:
        try:
            notebook_path = (
                dbutils_value.notebook.entry_point.getDbutils()
                .notebook()
                .getContext()
                .notebookPath()
                .get()
            )
        except Exception:
            notebook_path = None

        if notebook_path and "/notebooks/jobs/" in notebook_path:
            workspace_root = notebook_path.split("/notebooks/jobs/", maxsplit=1)[0]
            candidate_roots.append(workspace_root)

            if not workspace_root.startswith("/Workspace/"):
                candidate_roots.append(f"/Workspace{workspace_root}")

    file_path = globals().get("__file__")

    if file_path:
        for parent in Path(str(file_path)).resolve().parents:
            if (parent / "ingest").exists():
                candidate_roots.append(str(parent))
                break

    for root in candidate_roots:
        if root and root not in sys.path:
            sys.path.insert(0, root)


add_bundle_source_root_to_python_path()

from ingest.garmin.bronze import ingest_garmin_fit_bronze, result_to_log_lines  # noqa: E402


def widget_value(name: str, default: str) -> str:
    dbutils_value = globals().get("dbutils")

    if dbutils_value is None:
        return default

    dbutils_value.widgets.text(name, default)
    return str(dbutils_value.widgets.get(name))


source_path = widget_value("source_path", "/Volumes/running_signals/bronze/raw_garmin/fit")
catalog = widget_value("catalog", "running_signals")
schema = widget_value("schema", "bronze")
full_refresh = widget_value("full_refresh", "false").strip().lower() in {"1", "true", "yes"}

spark_session = globals().get("spark")

if spark_session is None:
    raise RuntimeError("This notebook must run in Databricks with an active Spark session.")

result = ingest_garmin_fit_bronze(
    spark=spark_session,
    source_path=source_path,
    catalog=catalog,
    schema=schema,
    full_refresh=full_refresh,
)

for line in result_to_log_lines(result):
    print(line)
