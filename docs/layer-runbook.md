# Layer Setup And Refresh Runbook

This runbook is the operational path for creating or updating every data layer in Running Signals.

The required order is:

```text
Terraform infrastructure
    -> raw S3 FIT and health files
    -> Databricks bronze tables
    -> dbt silver and gold models
    -> dbt tests
```

`dbt compile` only renders SQL. It does not create or refresh Databricks tables or views. Use
`dbt run` to materialize silver and gold.

## Prerequisites

Install project dependencies:

```bash
uv sync
```

Create a local environment file from the example and fill in the values:

```bash
cp .env.example .env
```

The root `.env` is for repository operations: Garmin downloaders, AWS/S3 landing, Databricks/dbt,
and the Supabase read-model sync. The Next.js site has its own runtime example at
`apps/site/.env.example` because Next reads env files from the app project directory.

Required values for raw S3 landing:

```bash
GARMIN_EMAIL=
GARMIN_PASSWORD=
GARMIN_FIT_S3_BUCKET=
GARMIN_FIT_S3_PREFIX=garmin/fit
GARMIN_HEALTH_S3_BUCKET=
GARMIN_HEALTH_S3_PREFIX=garmin/health/daily
AWS_REGION=eu-central-1
# Local development SSO profile.
# Leave unset in production automation that receives AWS role credentials.
AWS_PROFILE=running-signals-dev
```

Use the `running-signals-dev` AWS IAM Identity Center profile for local S3 landing and bucket checks.
Configure it once using
[infra/terraform/README.md](../infra/terraform/README.md#aws-credentials). Production automated
refreshes should not use this SSO-backed profile or rely on a local SSO token; they should receive
automatically refreshed AWS credentials from the job runtime, such as GitHub Actions OIDC assuming
a scoped IAM role or an AWS instance, task, or Lambda role. Garmin authentication is separate:
scheduled downloaders need a valid, writable Garmin token store passed with `--tokenstore` outside
the repository, or `GARMIN_EMAIL` and `GARMIN_PASSWORD` supplied through the production secret
manager.

Required values for Databricks and dbt:

```bash
DATABRICKS_HOST=dbc-<workspace-id>.cloud.databricks.com
DATABRICKS_TOKEN=<your-databricks-token>
DATABRICKS_HTTP_PATH=/sql/1.0/warehouses/<warehouse-id>
DATABRICKS_CATALOG=running_signals
DATABRICKS_BRONZE_SCHEMA=bronze
DATABRICKS_SILVER_SCHEMA=silver
DATABRICKS_GOLD_SCHEMA=gold
```

The Databricks token should have the `all-apis` scope. The token principal needs permission to use
the SQL warehouse, use the `running_signals` catalog and `bronze`, `silver`, and `gold` schemas,
select from bronze tables, and create or replace objects in `silver` and `gold`.

Load the `.env` values into the current shell before running commands that need them:

```bash
set -a
source .env
set +a
```

Configure dbt once for the local user:

```bash
mkdir -p ~/.dbt
cp dbt/profiles.yml.example ~/.dbt/profiles.yml
```

The profile reads credentials from environment variables, so `~/.dbt/profiles.yml` should not contain
secrets.

## First-Time Infrastructure Setup

Terraform creates the raw S3 bucket, Unity Catalog catalog, `bronze`, `silver`, and `gold` schemas,
storage credentials, external locations, and the raw Garmin volume.

Run the Terraform workflow from `infra/terraform`:

```bash
cd infra/terraform
terraform init
terraform validate
terraform plan
terraform apply
```

For a brand-new Databricks storage credential, follow the two-pass external ID workflow documented in
`infra/terraform/README.md`. After a successful apply, confirm these outputs exist:

```bash
terraform output raw_bucket_name
terraform output garmin_fit_volume_path
terraform output garmin_health_volume_path
```

Expected Databricks volume paths:

```text
/Volumes/running_signals/bronze/raw_garmin/fit
/Volumes/running_signals/bronze/raw_garmin/health/daily
```

Return to the repo root:

```bash
cd ../..
```

## Deploy Databricks Jobs

Deploy the Databricks Asset Bundle after infrastructure exists:

```bash
cd databricks
uv run databricks bundle validate
uv run databricks bundle deploy
cd ..
```

This deploys two paused jobs:

- `garmin_fit_bronze_ingestion`
- `garmin_health_bronze_ingestion`

## Land Raw Garmin Files

FIT and health JSON are separate raw inputs. Both are required for a full dbt run.

For local runs, refresh the SSO session for the configured `running-signals-dev` profile before
landing files or listing S3:

```bash
aws sso login --profile running-signals-dev
aws sts get-caller-identity --profile running-signals-dev
```

Skip this step for production scheduled refreshes. They should use automatically refreshed AWS role
credentials and non-interactive Garmin token handling as described in
[scripts/README.md](../scripts/README.md#aws-credentials-for-s3-downloads) and
[docs/technical-decisions.md](technical-decisions.md#why-unattended-garmin-downloads-should-not-use-aws-sso).

For an initial backfill, choose a date range and run both downloaders:

```bash
uv run python scripts/download_garmin_fit.py \
  --destination s3 \
  --mode range-overwrite \
  --start-date 2026-06-01 \
  --end-date 2026-06-07

uv run python scripts/download_garmin_health.py \
  --destination s3 \
  --mode range-overwrite \
  --start-date 2026-06-01 \
  --end-date 2026-06-07
```

For a routine refresh, use incremental landing for both raw inputs:

```bash
uv run python scripts/download_garmin_fit.py \
  --destination s3 \
  --mode incremental

uv run python scripts/download_garmin_health.py \
  --destination s3 \
  --mode incremental
```

Confirm raw files exist in S3:

```bash
aws s3 ls "s3://${GARMIN_FIT_S3_BUCKET}/${GARMIN_FIT_S3_PREFIX}/"
aws s3 ls "s3://${GARMIN_HEALTH_S3_BUCKET:-$GARMIN_FIT_S3_BUCKET}/${GARMIN_HEALTH_S3_PREFIX}/"
```

## Build Bronze

Run both bronze ingestion jobs. The health job is required before building `silver_health_days`.

```bash
cd databricks
uv run databricks bundle run garmin_fit_bronze_ingestion
uv run databricks bundle run garmin_health_bronze_ingestion
cd ..
```

Expected bronze tables:

```text
running_signals.bronze.garmin_fit_sessions
running_signals.bronze.garmin_fit_events
running_signals.bronze.garmin_fit_records
running_signals.bronze.garmin_health_daily_payloads
```

If `dbt run` fails with:

```text
TABLE_OR_VIEW_NOT_FOUND: running_signals.bronze.garmin_health_daily_payloads
```

then the health bronze job has not created the required source table yet. Land health JSON and rerun
`garmin_health_bronze_ingestion`.

## Build Silver And Gold

Validate dbt configuration:

```bash
uv run dbt parse --project-dir dbt
uv run dbt compile --project-dir dbt
```

Materialize the full silver and gold graph:

```bash
uv run dbt run --project-dir dbt
```

Run dbt tests:

```bash
uv run dbt test --project-dir dbt
```

Expected silver models:

```text
running_signals.silver.silver_dates
running_signals.silver.silver_runs
running_signals.silver.silver_run_records
running_signals.silver.silver_health_days
running_signals.silver.silver_weeks
```

Expected gold models:

```text
running_signals.gold.mart_days
running_signals.gold.mart_weeks
running_signals.gold.mart_months
running_signals.gold.mart_years
running_signals.gold.mart_run_sessions
running_signals.gold.mart_run_segments
running_signals.gold.mart_route_clusters
running_signals.gold.mart_routes
running_signals.gold.mart_route_prediction_features
running_signals.gold.signal_consistency
running_signals.gold.signal_volume
running_signals.gold.signal_fitness
running_signals.gold.mart_runs
running_signals.gold.mart_running_signals
running_signals.gold.mart_weekly_training_features
```

## Useful Partial Runs

Run the primary day-first graph:

```bash
uv run dbt run \
  --project-dir dbt \
  --select silver_dates+ mart_days+ mart_weeks mart_months mart_years
```

Run the route-ready session, segment, route, and feature graph:

```bash
uv run dbt run \
  --project-dir dbt \
  --select silver_run_records+ mart_route_prediction_features
```

Run the compatibility weekly signal path:

```bash
uv run dbt run \
  --project-dir dbt \
  --select mart_weeks+ mart_weekly_training_features
```

## Local Quality Checks

Before committing changes, run:

```bash
uv run pytest
uv run ruff check ingest scripts tests
uv run mypy ingest scripts tests

cd infra/terraform
terraform validate
cd ../..

uv run dbt parse --project-dir dbt
uv run dbt ls --project-dir dbt --select silver_dates+ mart_route_prediction_features
```

Use real Databricks credentials for:

```bash
uv run dbt run --project-dir dbt
uv run dbt test --project-dir dbt
```

Reload the Supabase presentation read models after dbt succeeds:

```bash
uv run python scripts/sync_site_supabase.py
```

Required values for the sync are:

- `DATABRICKS_HOST`
- `DATABRICKS_TOKEN`
- `DATABRICKS_HTTP_PATH`
- `DATABRICKS_CATALOG`
- `DATABRICKS_GOLD_SCHEMA`

For local development, `SUPABASE_DB_URL` is not required. The sync script defaults to the Supabase
CLI database at `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. For hosted Supabase,
set `SUPABASE_DB_URL` to a direct database connection with write privileges.

Do not put `SUPABASE_DB_URL` in the site deployment environment. The site only needs
`SUPABASE_URL` and `SUPABASE_ANON_KEY`.

Use `--dry-run` to fetch Databricks row counts without writing to Supabase.

Spot-check Databricks results after a full build:

- Weekly, monthly, and yearly totals reconcile to `mart_days`.
- `mart_run_segments` distance and duration reconcile approximately to `mart_run_sessions`.
- `mart_route_clusters` has one row per GPS-backed run and `route_match_similarity` stays between 0
  and 1.
- `mart_route_prediction_features` contains labels only from the current run observation and prior
  route/training context in feature columns.
