# Architecture

Running Signals uses a small lakehouse pipeline to turn Garmin running activity files and daily
Garmin Connect health context into documented training signal tables.

```text
Garmin Connect
    -> Python FIT and health JSON downloaders
    -> S3 raw FIT and health JSON landing zones
    -> Databricks Unity Catalog external volume
    -> Databricks bronze Delta tables
    -> dbt silver and gold models
    -> presentation layer
```

## Purpose

The architecture is intentionally simple. Each layer has one job:

- Python retrieves raw Garmin FIT files and daily health JSON payloads and lands them in object
  storage.
- S3 keeps the recoverable raw files and JSON payloads.
- Unity Catalog exposes those files to Databricks through a governed volume path.
- Databricks parses FIT files and loads health JSON envelopes into bronze Delta tables with source
  metadata.
- dbt owns analytical modeling, tests, and presentation-ready tables.

This keeps extraction, storage, ingestion, transformation, and communication separate
without introducing unnecessary orchestration.

## Data Flow

The Python downloader (`scripts/download_garmin_fit.py`) retrieves Garmin FIT files and writes them
to S3 with the Garmin activity id as the object name:

```text
s3://<bucket>/garmin/fit/{garmin_activity_id}.fit
```

The health downloader (`scripts/download_garmin_health.py`) retrieves daily Garmin Connect API
payloads for HRV, resting heart rate, sleep, and heart-rate summaries. Each raw file is a recoverable
JSON envelope:

```text
s3://<bucket>/garmin/health/daily/calendar_date=YYYY-MM-DD/{payload_type}.json
```

Databricks reads the same files through the external Unity Catalog volume created by Terraform:

```text
/Volumes/running_signals/bronze/raw_garmin/fit/{garmin_activity_id}.fit
/Volumes/running_signals/bronze/raw_garmin/health/daily/calendar_date=YYYY-MM-DD/{payload_type}.json
```

The FIT bronze ingestion job parses each FIT file into three source-shaped entities:

- `bronze.garmin_fit_sessions`
- `bronze.garmin_fit_events`
- `bronze.garmin_fit_records`

The health bronze ingestion job loads daily Garmin Connect JSON envelopes into:

- `bronze.garmin_health_daily_payloads`

FIT bronze tables carry `run_id`, `garmin_activity_id`, source file metadata, and ingestion metadata.
`run_date` is derived from the FIT session start time and is used as the Delta partition column. The
health bronze table carries `calendar_date`, `payload_type`, raw JSON, source method, source file
metadata, and ingestion metadata. It is partitioned by `calendar_date`.

## Infrastructure

Terraform in `infra/terraform` manages the raw S3 bucket, IAM role and policy, Unity Catalog catalog
and `bronze` schema, storage credential, external locations, and external volume. The raw FIT prefix
is external storage because files are produced outside Databricks and consumed by Databricks through
Unity Catalog.

See `infra/terraform/README.md` for the AWS profile setup, Databricks external ID bootstrap, and
post-apply checks.

## Orchestration

The Databricks Asset Bundle in `databricks/` defines a paused daily serverless job:
`garmin_fit_bronze_ingestion`. The job entrypoint is
`notebooks/jobs/garmin_fit_bronze_ingestion.py`; parsing, validation, metadata enrichment,
and write behavior live under `ingest/garmin`.

The bundle also defines `garmin_health_bronze_ingestion`, which loads the raw daily health JSON
envelopes into `bronze.garmin_health_daily_payloads`. It compares source file size and modification
time by `calendar_date` and `payload_type`, replacing changed rows and skipping unchanged payloads.

The ingestion job compares available FIT files with existing bronze session metadata. New or changed
files are parsed and written. Unchanged files are skipped. If an already-ingested FIT file changes,
the job deletes that `run_id` from all three bronze tables before appending replacement rows, making
repeated runs idempotent without heavier orchestration.

See `scripts/README.md` for FIT landing commands and the S3 landing smoke test.

## Modeling

dbt treats the bronze FIT tables as sources. The current modeled path is:

```text
bronze FIT sources -> silver_runs
bronze health JSON source -> silver_health_days
silver_runs -> silver_weeks
silver_runs + silver_health_days -> signal_fitness
silver_weeks -> signal_consistency, signal_volume
signals -> mart_runs, mart_weeks, mart_running_signals, mart_weekly_training_features
```

Silver models standardize run-level fields and daily health context. Gold signal models define
consistency, volume, and fitness metrics. `silver_weeks` supplies a completed-week spine so missed
weeks, streaks, and rolling windows are explicit. Gold mart models shape the outputs for the
presentation layer and prediction-ready analysis. Health fields are descriptive context, not
readiness or medical scoring.

## Analytics Readiness

The modeled outputs support three analytical uses without turning the project into a coaching
product:

- Monitoring: `mart_weeks` exposes weekly consistency and volume measures on a complete week spine,
  including missed weeks.
- Visual analytics: `mart_running_signals` joins run-level fitness indicators with the relevant
  weekly training context for portfolio communication.
- Prediction-ready features: `mart_weekly_training_features` combines current-week metrics, weekly
  health aggregates, prior-week lag fields, and next-week labels such as distance and run count. It
  prepares data for later modeling experiments but does not produce predictions.

See `docs/data-model.md` and `dbt/models/models.yml` for grains, important columns, and tests.
See `docs/layer-runbook.md` for the exact setup and refresh commands across raw, bronze, silver,
and gold.

## References

- `scripts/README.md` for Garmin FIT download and S3 landing details.
- `infra/terraform/README.md` for infrastructure setup and Unity Catalog bootstrap.
- `docs/garmin-data-exploration.md` for the exploratory FIT validation notebook.
- `docs/data-model.md` for bronze, silver, and gold model details.
- [Databricks Unity Catalog cloud storage](https://docs.databricks.com/aws/en/connect/unity-catalog/cloud-storage)
- [Databricks Unity Catalog volumes](https://docs.databricks.com/aws/en/volumes/)
- [Databricks Asset Bundles](https://docs.databricks.com/aws/en/dev-tools/bundles/)
- [dbt sources](https://docs.getdbt.com/docs/build/sources)
- [Garmin FIT SDK](https://developer.garmin.com/fit/overview/)
