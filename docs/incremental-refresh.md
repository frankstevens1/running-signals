## Incremental refresh automation

```text
Daily GitHub Actions schedule
            |
            v
Authenticate with OIDC and install with uv
            |
            v
running-signals refresh incremental --no-input --json --databricks-target production
            |
            v
FIT raw -> health raw -> FIT bronze -> health bronze -> dbt build -> Supabase sync
            |
            v
Next.js site
```

### 1. GitHub Actions starts

The tracked workflow at `.github/workflows/incremental-refresh.yml` runs once per
day at 05:15 UTC and also supports manual dispatch. GitHub Actions concurrency
prevents overlapping scheduled or manually dispatched refreshes.

The separate `.github/workflows/deploy-databricks-bundle.yml` workflow deploys the
stable `production` bundle target whenever bundle, ingestion, or job-notebook code
changes on `main`. Run it manually once after configuring secrets before enabling the
scheduled refresh.

It checks out the repository and runs:

```bash
uv sync --locked
uv run running-signals refresh incremental --no-input --json --databricks-target production
```

It receives:

- Garmin credentials from GitHub secrets
- Temporary AWS credentials through OIDC
- S3 bucket configuration from workflow variables
- Databricks, Supabase, and dbt-profile secrets

No local SSO session is involved.

### Required GitHub configuration

Apply the Terraform OIDC resources, then set the repository variable
`AWS_REFRESH_ROLE_ARN` to `terraform output -raw github_actions_refresh_role_arn`.
Set `AWS_REGION`, `GARMIN_FIT_S3_BUCKET`, `GARMIN_FIT_S3_PREFIX`,
`GARMIN_HEALTH_S3_BUCKET`, `GARMIN_HEALTH_S3_PREFIX`, `DATABRICKS_CATALOG`, and
`DATABRICKS_GOLD_SCHEMA` as repository variables.

Set `GARMIN_EMAIL`, `GARMIN_PASSWORD`, `DATABRICKS_HOST`, `DATABRICKS_TOKEN`,
`DATABRICKS_HTTP_PATH`, `SUPABASE_DB_URL`, and `DBT_PROFILES_YML` as repository
secrets. `DBT_PROFILES_YML` is the complete CI dbt `profiles.yml` content and is
written to the runner's temporary directory for the job.

### 2. CLI stage behavior

The CLI checks required Garmin raw S3, Databricks, hosted Supabase, and
non-interactive Garmin configuration values before it writes. It validates the
Databricks SQL warehouse path, PostgreSQL connection URL shape, and local dbt profile
presence, but does not test remote connectivity. It stores an atomic JSON manifest
per run under `$XDG_STATE_HOME/running-signals` or
`~/.local/state/running-signals`; the workflow uploads these manifests as artifacts.

The FIT downloader lists existing objects under:

```text
s3://bucket/garmin/fit/
```

It scans the configured recent Garmin activity window and downloads every activity
whose FIT object is missing. Existing activities are recorded as skips rather than
ending the scan, so a failed or reordered activity inside that window is retried.

If there are no existing FIT files, incremental mode fails intentionally. The first
run must establish a complete raw baseline manually.

### 3. Health incremental refresh

The health downloader tracks four payload identities:

```text
(calendar_date, payload_type)
hrv, rhr, sleep, heart_rates
```

Missing payloads are fetched and written to:

```text
s3://bucket/garmin/health/daily/
  calendar_date=2026-07-13/hrv.json
  calendar_date=2026-07-13/rhr.json
  calendar_date=2026-07-13/sleep.json
  calendar_date=2026-07-13/heart_rates.json
```

Existing payloads are skipped. If a previous run fetched three of four payloads,
the next run retries only the missing payload. Any endpoint failure makes the raw
stage fail after all endpoints have been attempted, so bronze is never triggered
with incomplete health data.

### 4. Databricks bronze ingestion

Only after both raw stages succeed does the CLI wait for both Databricks bronze jobs.

- FIT bronze reads new or changed FIT files and replaces affected session, event,
  and record rows.
- Health bronze reads new or changed JSON envelopes and replaces affected payload
  rows.

The CLI records the exact Databricks command and exit status in the manifest. It
does not publish downstream data after a bronze failure.

### 5. dbt and presentation refresh

After both bronze jobs succeed, the CLI runs:

```text
dbt build
sync_site_supabase.py --no-progress
```

`dbt build` materializes and tests the full graph. Supabase publishing only runs if
that command succeeds. The site then reads the refreshed Supabase `site_*` tables.

### What happens when nothing changed?

A normal no-change run looks like:

```text
FIT:     0 files downloaded
Health:  0 payloads downloaded
Bronze:  no source changes
dbt:     rebuilt and tested
Site:    unchanged
```

The initial CLI intentionally still runs bronze, dbt, and publishing after a
no-change raw landing. Skipping downstream layers safely requires a durable
cross-layer reconciliation checkpoint, rather than only raw download counts.

### Failure behavior

The important property is safe reruns:

```text
FIT succeeds
Health fails
    -> no bronze trigger
    -> next run skips FIT files already landed
    -> next run retries missing health payloads

Raw landing succeeds
Bronze fails
    -> next run skips unchanged raw files
    -> bronze retries processing

Bronze succeeds
dbt fails
    -> raw and bronze remain available
    -> dbt can be rerun independently
```

`range-overwrite` remains a manual raw-backfill workflow and is not exposed through
the CLI. Current FIT range overwrite deletes every raw FIT file in its configured
destination before loading the requested range, so it is unsafe for partial history.
