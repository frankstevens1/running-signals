## Independent Incremental Refreshes

FIT is the scheduled pipeline. Health is an independent manual analytics pipeline.

```text
Daily GitHub Actions schedule
            |
            v
FIT raw -> FIT bronze -> dbt fit_refresh -> Supabase FIT tables -> Next.js site

Manual command
            |
            v
Health raw -> health bronze -> dbt health_refresh
```

## FIT Refresh

The default command is FIT-only:

```bash
uv run running-signals preflight --source fit --no-input --databricks-target dev
uv run running-signals refresh incremental \
  --no-input \
  --json \
  --databricks-target dev
```

Its stages are:

```text
fit_raw -> bronze_fit -> dbt_fit -> publish_fit
```

The tracked `.github/workflows/incremental-fit-refresh.yml` workflow runs this command daily at
05:15 UTC and supports manual dispatch. It uses the `running-signals-fit-refresh` concurrency group.
The workflow requires FIT S3 configuration but no health S3 variables.

The project currently uses only the Databricks `dev` bundle target. Preflight reads the bundle
summary and fails before raw landing when the source-specific job is not deployed.

Configure repository variables `AWS_REFRESH_ROLE_ARN`, `AWS_REGION`, `GARMIN_FIT_S3_BUCKET`,
`GARMIN_FIT_S3_PREFIX`, `DATABRICKS_CATALOG`, and `DATABRICKS_GOLD_SCHEMA`. Configure repository
secrets `GARMIN_EMAIL`, `GARMIN_PASSWORD`, `DATABRICKS_HOST`, `DATABRICKS_TOKEN`,
`DATABRICKS_HTTP_PATH`, `SUPABASE_DB_URL`, and `DBT_PROFILES_YML`.

The FIT dbt selector contains no health source or health model. FIT publishing updates only FIT
serving tables.

## Health Refresh

Health is currently manual-only:

```bash
uv run running-signals preflight --source health --no-input --databricks-target dev
uv run running-signals refresh incremental \
  --source health \
  --no-input \
  --json \
  --databricks-target dev
```

Its stages are:

```text
health_raw -> bronze_health -> dbt_health
```

Health endpoint failures fail only the health run. They do not prevent the scheduled FIT lane from
landing, modeling, or publishing running data. Health preflight does not require
`SUPABASE_DB_URL`, and there is no health publisher or scheduled health workflow.

## Serving Behavior

The publisher loads FIT output into `site_*_core`, route, map-profile, segment, day, week, and
fitness tables. It does not export months or years; the frontend derives those periods
from published days. Existing public names such as `site_runs`, `site_days`, `site_fitness`, and
`site_dashboard_summary` remain compatibility views over their core tables.

## dbt Selectors

The source-isolated commands are:

```bash
uv run dbt build --project-dir dbt --selector fit_refresh --target-path target/fit
uv run dbt build --project-dir dbt --selector health_refresh --target-path target/health
```

`fit_refresh` starts from the three FIT bronze sources and builds the complete presented running
graph. `health_refresh` starts from `garmin_health_daily_payloads` and builds `health_days` plus
`mart_health_days`.

## FIT Publisher

The publisher is FIT-only:

```bash
uv run python scripts/sync_site_supabase.py --no-progress
```

It maintains the unprefixed fingerprints, row counts, generation time, and latest-date metadata.
Removed exports are pruned from fingerprint and row-count metadata after a successful publish.

## Locks And Manifests

FIT and health use separate local lock files and manifests under `$XDG_STATE_HOME/running-signals`
or `~/.local/state/running-signals`. dbt also uses separate target paths. Every run streams child
logs, emits 30-second heartbeats, records phase durations, and prints a final timing table.

## Failure Behavior

```text
FIT fails
    -> health snapshot remains unchanged
    -> no partial FIT publish

Health fails
    -> FIT pipeline is unaffected
    -> no Supabase operation is attempted

Either dbt selector fails
    -> downstream stages stop; only FIT has a publish stage
```

Raw FIT `range-overwrite` remains excluded from the CLI because it deletes every FIT object in its
configured destination before downloading the requested range.
