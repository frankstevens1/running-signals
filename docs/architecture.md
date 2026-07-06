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

Terraform in `infra/terraform` manages the raw S3 bucket, IAM role and policy, Unity Catalog catalog,
`bronze`, `silver`, and `gold` schemas, storage credential, external locations, and external
volumes. The raw Garmin FIT and health prefixes are external storage because files are produced
outside Databricks and consumed by Databricks through Unity Catalog.

See `infra/terraform/README.md` for the AWS profile setup, Databricks external ID bootstrap, and
post-apply checks.

## Orchestration

The Databricks Asset Bundle in `databricks/` defines paused serverless jobs for raw-to-bronze
ingestion:

- `garmin_fit_bronze_ingestion`
- `garmin_health_bronze_ingestion`

The FIT job entrypoint is `notebooks/jobs/garmin_fit_bronze_ingestion.py`; parsing, validation,
metadata enrichment, and write behavior live under `ingest/garmin`.

The health job loads the raw daily health JSON envelopes into
`bronze.garmin_health_daily_payloads`. It compares source file size and modification time by
`calendar_date` and `payload_type`, replacing changed rows and skipping unchanged payloads.

The FIT ingestion job compares available FIT files with existing bronze session metadata. New or
changed files are parsed and written. Unchanged files are skipped. If an already-ingested FIT file
changes, the job deletes that `run_id` from all three bronze tables before appending replacement
rows, making repeated runs idempotent without heavier orchestration.

See `scripts/README.md` for FIT and health landing commands and the S3 landing smoke test.

## Modeling

dbt treats the bronze FIT and health tables as sources. The current modeled path is:

```text
bronze FIT sources -> silver_runs, silver_run_records
bronze health JSON source -> silver_health_days
silver_runs + silver_health_days -> silver_dates
silver_dates + silver_runs + silver_health_days -> mart_days
mart_days -> mart_weeks, mart_months, mart_years
mart_weeks -> signal_consistency, signal_volume, mart_weekly_training_features
silver_run_records -> mart_run_segments
silver_runs + mart_days + mart_run_segments -> mart_run_sessions
mart_run_sessions -> mart_routes
mart_run_sessions + mart_routes -> mart_route_prediction_features
silver_runs + silver_health_days -> signal_fitness, mart_runs, mart_running_signals
```

Silver models standardize date, run-level, per-record, and daily health context fields. The primary
analytical foundation is `mart_days`; weekly, monthly, and yearly outputs roll up from that daily
mart. Weekly signal models remain as compatibility outputs, while route, segment, and run-session
marts support route and performance analysis. Health fields are descriptive context, not readiness
or medical scoring.

## Analytics Readiness

The modeled outputs support three analytical uses without turning the project into a coaching
product:

- Monitoring: `mart_days`, `mart_weeks`, `mart_months`, and `mart_years` expose daily training
  behavior and calendar rollups.
- Visual analytics: `mart_runs`, `mart_run_sessions`, `mart_routes`, `mart_run_segments`, and
  `mart_running_signals` expose run, route, segment, and signal views for portfolio communication.
- Prediction-ready features: `mart_route_prediction_features` and
  `mart_weekly_training_features` provide transparent feature and label columns for later modeling
  experiments, but do not train models or produce forecasts.

See `docs/data-model.md` and `dbt/models/models.yml` for grains, important columns, and tests.
See `docs/layer-runbook.md` for the exact setup and refresh commands across raw, bronze, silver,
and gold.

## References

- `scripts/README.md` for Garmin FIT and health download and S3 landing details.
- `infra/terraform/README.md` for infrastructure setup and Unity Catalog bootstrap.
- `docs/garmin-data-exploration.md` for exploratory FIT and health payload validation.
- `docs/data-model.md` for bronze, silver, and gold model details.
- [Databricks Unity Catalog cloud storage](https://docs.databricks.com/aws/en/connect/unity-catalog/cloud-storage)
- [Databricks Unity Catalog volumes](https://docs.databricks.com/aws/en/volumes/)
- [Databricks Asset Bundles](https://docs.databricks.com/aws/en/dev-tools/bundles/)
- [dbt sources](https://docs.getdbt.com/docs/build/sources)
- [Garmin FIT SDK](https://developer.garmin.com/fit/overview/)
