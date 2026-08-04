## Unified Incremental Refreshes

FIT is the scheduled pipeline. Health is an independent manual analytics pipeline that feeds into the same dbt DAG.

```text
Daily GitHub Actions schedule
            |
            v
FIT raw -> FIT bronze -> dbt build -> route geocoding -> Supabase FIT tables -> Next.js site

Manual command
            |
            v
Health raw -> health bronze -> dbt build
```

## FIT Refresh

The complete FIT command is:

```bash
uv run running-signals preflight refresh fit --no-input
uv run running-signals refresh fit --mode incremental \
  --no-input \
  --json \
  --databricks-target dev
```

Its stages are:

```text
fit_raw -> bronze_fit -> dbt_fit -> geocode_cities -> publish_fit
```

The tracked `.github/workflows/incremental-fit-refresh.yml` workflow runs this command daily at
05:15 UTC and supports manual dispatch. It uses the `running-signals-fit-refresh` concurrency group.
The workflow requires FIT S3 configuration but no health S3 variables.

The project currently uses only the Databricks `dev` bundle target. Preflight checks local
configuration; bronze execution reads the bundle summary and fails before raw landing when the
source-specific job is not deployed.

Configure repository variables `AWS_REFRESH_ROLE_ARN`, `AWS_REGION`, `GARMIN_FIT_S3_BUCKET`,
`GARMIN_FIT_S3_PREFIX`, `DATABRICKS_CATALOG`, and `DATABRICKS_GOLD_SCHEMA`. Configure repository
secrets `GARMIN_EMAIL`, `GARMIN_PASSWORD`, `DATABRICKS_HOST`, `DATABRICKS_TOKEN`,
`DATABRICKS_HTTP_PATH`, `SUPABASE_DB_URL`, and `DBT_PROFILES_YML`.

FIT publishing updates only FIT serving tables. The unified `mart_days` model joins silver `health_days`
into the daily training foundation; missing health observations remain null.

## Health Refresh

Health is currently manual-only:

```bash
uv run running-signals preflight refresh health --no-input
uv run running-signals refresh health --mode incremental \
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

## dbt Build

The unified DAG builds from both FIT and health bronze sources:

```bash
uv run dbt build --project-dir dbt
```

`mart_days` joins silver `health_days` into the daily training foundation. Days with no health
observations will have null health columns and false availability flags. On the free-edition
serverless warehouse, use `--threads 4` if you hit connection resets.

The orchestration CLI also supports isolated stages:

```bash
uv run running-signals raw fit --mode incremental --no-input
uv run running-signals bronze fit --mode incremental
uv run running-signals dbt fit
uv run running-signals geocode
uv run running-signals publish --mode incremental
```

`running-signals dbt all` builds the full dbt DAG. Full source refreshes rebuild from existing raw
landing and require confirmation:

```bash
uv run running-signals refresh fit --mode full --confirm --no-input
uv run running-signals refresh health --mode full --confirm --no-input
```

FIT raw range overwrite is available only as an explicit isolated operation because it deletes the
selected FIT prefix before downloading the requested range:

```bash
uv run running-signals raw fit --mode range-overwrite \
  --start-date 2026-01-01 --end-date 2026-12-31 --confirm --no-input
```

## FIT Publisher

The publisher is FIT-only:

```bash
uv run running-signals publish --mode incremental
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

dbt build fails
    -> downstream stages stop; only FIT has a publish stage
```

Raw FIT `range-overwrite` requires explicit dates and `--confirm`; follow it with
`running-signals refresh fit --mode full --confirm`.
