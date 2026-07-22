# Layer Setup And Refresh Runbook

Operational path for building and refreshing every data layer in Running Signals:

```text
Terraform infrastructure
    -> raw S3 FIT and health files
    -> Databricks bronze tables
    -> dbt silver and gold models
    -> Supabase site read models
```

## Initial Setup

One-time steps for a new machine or workspace.

### 1. Dependencies and environment

```bash
uv sync --extra dev
cp .env.example .env
```

Fill in `.env`:

```bash
# Garmin + S3 landing
GARMIN_EMAIL=
GARMIN_PASSWORD=
GARMIN_FIT_S3_BUCKET=
GARMIN_FIT_S3_PREFIX=garmin/fit
GARMIN_HEALTH_S3_BUCKET=
GARMIN_HEALTH_S3_PREFIX=garmin/health/daily
AWS_REGION=eu-central-1
AWS_PROFILE=running-signals-dev   # local SSO only; leave unset in automation

# Databricks / dbt
DATABRICKS_HOST=dbc-<workspace-id>.cloud.databricks.com
DATABRICKS_TOKEN=<your-databricks-token>
DATABRICKS_HTTP_PATH=/sql/1.0/warehouses/<warehouse-id>
DATABRICKS_CATALOG=running_signals
DATABRICKS_BRONZE_SCHEMA=bronze
DATABRICKS_SILVER_SCHEMA=silver
DATABRICKS_GOLD_SCHEMA=gold
```

The root `.env` covers repository operations. The Next.js site reads its own
`apps/site/.env.example` variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) — never put
`SUPABASE_DB_URL` there.

Load values into the shell before running commands:

```bash
set -a; source .env; set +a
```

For local S3 access, configure the `running-signals-dev` AWS IAM Identity Center profile once (see
[infra/terraform/README.md](../infra/terraform/README.md#aws-credentials)) and refresh sessions with
`aws sso login --profile running-signals-dev`. Production jobs use role credentials instead of SSO;
see [docs/technical-decisions.md](technical-decisions.md#why-unattended-garmin-downloads-should-not-use-aws-sso).

### 2. dbt profile

```bash
mkdir -p ~/.dbt
cp dbt/profiles.yml.example ~/.dbt/profiles.yml
```

The profile reads credentials from environment variables, so it contains no secrets.

### 3. Infrastructure (Terraform)

Creates the S3 bucket, Unity Catalog catalog, `bronze`/`silver`/`gold` schemas, storage credentials,
external locations, and raw volumes. For a new storage credential, follow the two-pass external ID
workflow in `infra/terraform/README.md`.

```bash
cd infra/terraform
terraform init
terraform apply
cd ../..
```

### 4. Databricks jobs

Deploys two paused ingestion jobs (`garmin_fit_bronze_ingestion`, `garmin_health_bronze_ingestion`):

```bash
cd databricks
uv run databricks bundle validate
uv run databricks bundle deploy
cd ..
```

### 5. Local Supabase (site development only)

```bash
supabase start
supabase migration up
```

## Running the Pipeline

Routine refresh, in order.

### 1. Land raw Garmin files

```bash
uv run python scripts/download_garmin_fit.py --destination s3 --mode incremental
uv run python scripts/download_garmin_health.py --destination s3 --mode incremental
```

For an initial backfill, replace `--mode incremental` with
`--mode range-overwrite --start-date YYYY-MM-DD --end-date YYYY-MM-DD`.

### 2. Build bronze

Both jobs are required; the health job must run before dbt builds `health_days`.

```bash
cd databricks
uv run databricks bundle run garmin_fit_bronze_ingestion
uv run databricks bundle run garmin_health_bronze_ingestion
cd ..
```

Expected bronze tables: `garmin_fit_sessions`, `garmin_fit_events`, `garmin_fit_records`,
`garmin_health_daily_payloads` in `running_signals.bronze`. If dbt fails with
`TABLE_OR_VIEW_NOT_FOUND: running_signals.bronze.garmin_health_daily_payloads`, land health JSON and
rerun the health job.

### 3. Build silver and gold

```bash
uv run dbt build --project-dir dbt
```

This materializes the full graph and runs all tests in one pass. On the free-edition serverless
warehouse, use `--threads 4` if you hit connection resets.

Silver layer: `dates`, `runs`, `run_records`, `health_days`, `weeks` (views) plus
`route_observations`, `route_similarity_edges` (tables). Gold layer: `mart_*` marts, `signal_*`
signals, and `int_*` intermediates. All dbt-managed; recreate any time with the command above.

Useful partial runs:

```bash
# Day-first calendar graph
uv run dbt run --project-dir dbt --select dates+ mart_days+ mart_weeks mart_months mart_years

# Route, session, segment, and feature graph
uv run dbt run --project-dir dbt --select run_records+ mart_route_prediction_features
```

### 4. Sync Supabase read models

```bash
uv run python scripts/sync_site_supabase.py
```

The sync is incremental: unchanged tables are skipped via content fingerprints, so a no-change run
finishes in seconds. Changed tables stream into Postgres with `COPY` in a single transaction.

- `--dry-run` — show which tables would sync or be skipped, without writing.
- `--full` — force a complete reload of every table.
- `--no-progress` — plain log lines instead of the progress bar.

Defaults to the local Supabase CLI database; set `SUPABASE_DB_URL` for hosted Supabase.

## Quality Checks

Before committing:

```bash
uv run pytest
uv run ruff check ingest scripts tests
uv run mypy ingest scripts tests
uv run dbt parse --project-dir dbt
```

Spot-check Databricks after a full build:

- Weekly, monthly, and yearly totals reconcile to `mart_days`.
- Every `mart_activity_records` run is ordered uniquely by `record_index`, and valid coordinate rows
  trace the complete route.
- `mart_run_segments` covers quarter, half, and full metric and imperial resolutions; allocated
  distance and duration reconcile to record-derived totals within numeric tolerance.
- `mart_route_clusters` has one row per GPS-backed run, `route_match_similarity` stays between 0
  and 1, and route identity comes from the isolated legacy 250m H3 path so `route_id` values remain
  stable.
- `mart_route_prediction_features` contains labels only from the current run and prior route or
  training context in feature columns.
