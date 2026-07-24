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

### 4. Databricks dev jobs

Deploys two paused ingestion jobs (`garmin_fit_bronze_ingestion`, `garmin_health_bronze_ingestion`):

```bash
cd databricks
databricks bundle validate --target dev
databricks bundle deploy --target dev
cd ..
```

The dev deployment workflow performs the same commands on `main` whenever
the bundle, ingestion code, or job notebooks change. The standalone Databricks CLI
must be installed locally; GitHub Actions installs its pinned version automatically.
`dev` is the only configured bundle target. The CLI preflight verifies that the selected source job
has a deployed Databricks job ID before any Garmin or S3 work begins.

### 5. Local Supabase (site development only)

```bash
supabase start
supabase migration up
```

## Running the Pipeline

### Routine FIT refresh

Use the orchestration CLI for the normal production flow:

```bash
uv run running-signals preflight --source fit --no-input --databricks-target dev
uv run running-signals refresh incremental --no-input --databricks-target dev
```

The default incremental command runs FIT raw landing, FIT bronze, the `fit_refresh` dbt selector,
and the FIT Supabase publisher. It does not invoke health. A failed stage prevents
following FIT stages. `--json` produces a machine-readable run manifest;
`--no-publish` stops after dbt; and `--dry-run` validates configuration and prints a
plan without remote calls or data writes. Run state is recorded outside the repository under
`$XDG_STATE_HOME/running-signals` or `~/.local/state/running-signals`.

`preflight` checks configuration presence and local value formats; it does not test
remote credentials or connectivity.

Expected FIT bronze tables are `garmin_fit_sessions`, `garmin_fit_events`, and
`garmin_fit_records` in `running_signals.bronze`.

### Manual health refresh

```bash
uv run running-signals preflight --source health --no-input --databricks-target dev
uv run running-signals refresh incremental --source health --no-input --databricks-target dev
```

The health lane builds only `health_days` and `mart_health_days` and then stops. It does not require
`SUPABASE_DB_URL` and does not publish to Supabase. A health failure does not block FIT.

### Rebuild derived data from existing raw landing

This replaces bronze data from the existing raw landing zone; it does not download
Garmin history. The confirmation is required because bronze tables are rebuilt.

```bash
uv run running-signals bronze --source fit --full-refresh --confirm --databricks-target dev
uv run dbt build --project-dir dbt --selector fit_refresh --target-path target/fit
uv run running-signals publish --full --confirm
```

Health has the equivalent independent bronze and dbt rebuild, with no publish step:

```bash
uv run running-signals bronze --source health --full-refresh --confirm --databricks-target dev
uv run dbt build --project-dir dbt --selector health_refresh --target-path target/health
```

### Build silver and gold manually

```bash
uv run dbt build --project-dir dbt --selector fit_refresh --target-path target/fit
```

This materializes the FIT graph and runs its tests in one pass. Build the independent health graph
with `--selector health_refresh --target-path target/health`. On the free-edition serverless
warehouse, use `--threads 4` if you hit connection resets.

The FIT selector contains `dates`, `runs`, `run_records`, `weeks`, route models, FIT marts, signals,
and intermediates. The health selector contains `health_days` and `mart_health_days`. All are
dbt-managed and source-isolated.

Useful partial runs:

```bash
# Day-first calendar graph
uv run dbt run --project-dir dbt --select dates+ mart_days+ mart_weeks mart_months mart_years

# Route, session, segment, and feature graph
uv run dbt run --project-dir dbt --select run_records+ mart_route_prediction_features
```

### Sync Supabase read models manually

```bash
uv run python scripts/sync_site_supabase.py
```

The sync is incremental: unchanged tables are skipped via content fingerprints, so a no-change run
finishes quickly. One Databricks statement computes all fingerprints. Changed tables use compressed
CloudFetch results and `COPY` into temporary Postgres staging tables; a short final transaction
replaces the serving tables and metadata atomically. Failed downloads retry from a fresh read query
without changing the live serving snapshot.

- `--dry-run` — show which tables would sync or be skipped, without writing.
- `--full` — force a complete reload of every table.
- `--no-progress` — plain log lines instead of the progress bar.

Defaults to the local Supabase CLI database; set `SUPABASE_DB_URL` for hosted Supabase.
The publisher is FIT-only. It exports days, weeks, and other core serving tables but not months or
years; those periods are derived from days by the frontend.

### Raw backfills and recovery

The CLI deliberately does not wrap raw FIT `range-overwrite`. That command deletes
every FIT file in its configured local directory or S3 prefix before downloading the
requested date range, so a partial range can discard unrelated history. Use it only
for a complete intentional reload after verifying the requested range, then run the
derived rebuild above. Routine refreshes must use incremental mode.

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
- `mart_map_profile_records` contains no more than 500 deterministic points per run and every key
  exists in `mart_activity_records`.
- `mart_run_segments` covers quarter, half, and full metric and imperial resolutions; allocated
  distance and duration reconcile to record-derived totals within numeric tolerance.
- `mart_route_clusters` has one row per GPS-backed run, `route_match_similarity` stays between 0
  and 1, and route identity comes from the isolated legacy 250m H3 path so `route_id` values remain
  stable.
- `mart_route_prediction_features` contains labels only from the current run and prior route or
  training context in feature columns.
