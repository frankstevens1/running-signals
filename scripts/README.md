# Scripts

Small operational entrypoints for local project tasks. Keep scripts thin: argument parsing,
user prompts, and orchestration belong here; reusable logic should live under `ingest/`.

For routine production refreshes, use the `running-signals` CLI. It preserves the
required stage order, records an atomic local manifest, and stops at the first failed
stage. FIT continues through Supabase; health stops after dbt.

```bash
uv run running-signals preflight --source fit --no-input --databricks-target dev
uv run running-signals refresh incremental --no-input --databricks-target dev
```

The default refresh is FIT-only. Health is independent and manual:

```bash
uv run running-signals refresh incremental --source health --no-input --databricks-target dev
```

The health command runs raw landing, bronze ingestion, and `dbt_health`. It does not
publish health data to Supabase.

Use `--json` for one machine-readable result document, `--dry-run` to validate and
render an incremental plan without remote calls or data writes, and `--no-publish` to
stop after a successful dbt build. Refresh manifests and the local advisory lock
live under `$XDG_STATE_HOME/running-signals` or `~/.local/state/running-signals`.

The CLI prints every stage start and completion, streams child command logs, and emits
a heartbeat every 30 seconds while a raw download or remote command is still running.
With `--json`, progress and child logs go to stderr while the pretty-printed manifest
remains the only stdout output. Each completed or failed run ends with an execution
timing table for every phase and the total runtime; the same durations are recorded
in the manifest.

`preflight` checks required configuration values, the Databricks SQL warehouse-path
format, and the local dbt profile presence. FIT preflight also checks the hosted
Supabase PostgreSQL URL; health preflight does not require `SUPABASE_DB_URL`. It does
not make remote connectivity checks.

`refresh incremental` intentionally has no `--full` or raw range-overwrite mode.
The existing FIT range-overwrite operation deletes every FIT file under its configured
destination before downloading, so it remains a manual recovery/backfill operation.

For individual entrypoints, recovery, and investigation, use the commands below.

## `download_garmin_fit.py`

Downloads Garmin running activities as raw `.fit` files.

S3 is the production destination. Files are written using this object layout:

```text
s3://<bucket>/garmin/fit/{garmin_activity_id}.fit
```

Local filesystem output remains available only for development and exploration.

Modes:

- `incremental`: scans the configured recent activity window and writes every missing
  run. It requires at least one existing `.fit` file as the baseline.
- `range-overwrite`: deletes existing `.fit` files in the configured destination
  scope, then downloads only running activities in the specified date range. For
  S3, deletion is limited to keys under the configured prefix.

Examples:

```bash
uv run python scripts/download_garmin_fit.py --destination s3 --mode range-overwrite --start-date 2026-01-01 --end-date 2026-12-31
uv run python scripts/download_garmin_fit.py --destination s3 --mode incremental
uv run python scripts/download_garmin_fit.py --destination local --mode range-overwrite --start-date 2026-01-01 --end-date 2026-12-31
```

Garmin credentials are read from the token store when available. If stored tokens
are unavailable, the underlying client prompts for Garmin credentials.

S3 configuration is read from CLI arguments first, then from the repository
`.env` file or shell environment:

- `GARMIN_FIT_S3_BUCKET`
- `GARMIN_FIT_S3_PREFIX`, defaulting to `garmin/fit`
- `AWS_REGION`, defaulting to the AWS SDK/environment default when unset
- `AWS_PROFILE`, when using an AWS IAM Identity Center profile

## `download_garmin_health.py`

Downloads daily Garmin Connect health JSON payloads for HRV, resting heart rate,
sleep, and heart-rate summaries.

S3 is the production destination. Files are written as recoverable JSON
envelopes using this object layout:

```text
s3://<bucket>/garmin/health/daily/calendar_date=YYYY-MM-DD/{payload_type}.json
```

Supported `payload_type` values are `hrv`, `rhr`, `sleep`, and `heart_rates`.
Endpoint failures are reported per day and endpoint without blocking the other
payloads for that day. The command exits non-zero after processing when any endpoint
failed, so scheduled refreshes never continue with incomplete health data.

Modes:

- `incremental`: writes only missing health payloads. When `--start-date` is not
  provided, the script starts at the latest payload date already present in the
  destination, or today when the destination is empty.
- `range-overwrite`: re-fetches every health payload in the requested date range,
  overwriting any existing files for successful endpoint calls.

Examples:

```bash
uv run python scripts/download_garmin_health.py --destination s3 --mode incremental
uv run python scripts/download_garmin_health.py --destination s3 --mode range-overwrite --start-date 2026-06-01 --end-date 2026-06-07
uv run python scripts/download_garmin_health.py --destination local --mode incremental --start-date 2026-06-01 --end-date 2026-06-07
```

S3 configuration is read from CLI arguments first, then from the repository
`.env` file or shell environment:

- `GARMIN_HEALTH_S3_BUCKET`, falling back to `GARMIN_FIT_S3_BUCKET`
- `GARMIN_HEALTH_S3_PREFIX`, defaulting to `garmin/health/daily`
- `AWS_REGION`, defaulting to the AWS SDK/environment default when unset
- `AWS_PROFILE`, when using an AWS IAM Identity Center profile

## `sync_site_supabase.py`

Reloads FIT Supabase presentation tables from Databricks gold tables. Run it only
after the FIT dbt selector succeeds.

```bash
uv run python scripts/sync_site_supabase.py --dry-run
uv run python scripts/sync_site_supabase.py
```

The sync is incremental by default. Before fetching, one Databricks statement computes a content
fingerprint per export (`count(*)` plus a sum of whole-row `xxhash64` hashes over the exact export query) and
compares it with fingerprint metadata in Supabase. Unchanged
tables are skipped entirely — no download, no truncate, no reload. Changed tables use the Databricks
SQL connector's compressed parallel CloudFetch path and stream bounded batches through `COPY` into
temporary Postgres staging tables. Failed reads retry the complete table with fresh result links.
A short final transaction replaces all changed serving tables and metadata atomically, so the site
keeps its previous consistent snapshot while remote data is downloading.

The publisher exports daily and weekly FIT read models. Monthly and yearly aggregates are derived
from days by the frontend and are not published. Route matching internals and non-serving segment
telemetry are also excluded from the export contract.

Flags:

- `--dry-run` prints which tables would sync or be skipped without writing to Supabase.
- `--full` forces a complete reload of every table, ignoring stored fingerprints.
- `--no-progress` disables the interactive per-table progress bar (plain log lines; also the
  automatic behavior when stdout is not a TTY).

Configuration is read from the repository `.env` file or shell environment:

- `DATABRICKS_HOST`
- `DATABRICKS_TOKEN`
- `DATABRICKS_HTTP_PATH`
- `DATABRICKS_CATALOG`
- `DATABRICKS_GOLD_SCHEMA`

For local development, `SUPABASE_DB_URL` is not required. The script defaults to the Supabase CLI
database at `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. For hosted Supabase, set
`SUPABASE_DB_URL` to a direct database connection with write privileges.

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are site runtime variables and belong in `apps/site/.env.local`
or the site deployment environment, not in the root operational `.env`.

## AWS Credentials For S3 Downloads

Local smoke tests may use an AWS IAM Identity Center profile:

```bash
aws sso login --profile running-signals-dev
AWS_PROFILE=running-signals-dev uv run python scripts/download_garmin_health.py --destination s3 --mode incremental
```

This is intentionally a manual workflow. SSO tokens expire and can fail with:

```text
botocore.exceptions.TokenRetrievalError: Error when retrieving token from sso: Token has expired and refresh failed
```

Do not use an SSO-backed `AWS_PROFILE` for unattended Garmin downloads. Automation should use
short-lived, automatically refreshed, non-interactive credentials, preferably GitHub Actions OIDC
assuming a scoped AWS IAM role. Running inside AWS with an instance, task, or Lambda role is also
acceptable. A dedicated IAM user access key is a fallback only if the policy is tightly scoped to the
raw Garmin landing prefixes and the key is rotated.

Garmin authentication is a separate automation concern. For production refresh jobs, pass a valid,
writable token store with `--tokenstore` from a secret-backed path outside the repository so refreshed
tokens can be persisted. Alternatively, provide non-interactive `GARMIN_EMAIL` and `GARMIN_PASSWORD`
values through the runtime secret manager.

## S3 Landing Smoke Test

Run this after `infra/terraform` has successfully created the S3 bucket and
Databricks external volume.

From `infra/terraform`, confirm the expected volume output exists:

```bash
terraform output garmin_fit_volume_path
```

Expected:

```text
"/Volumes/running_signals/bronze/raw_garmin/fit"
```

Export the S3 settings from Terraform:

```bash
export GARMIN_FIT_S3_BUCKET="$(terraform output -raw raw_bucket_name)"
export GARMIN_FIT_S3_PREFIX="garmin/fit"
export AWS_PROFILE="running-signals-dev"
export AWS_REGION="eu-central-1"
```

Verify AWS access before calling Garmin:

```bash
aws sts get-caller-identity
aws s3 ls "s3://${GARMIN_FIT_S3_BUCKET}/"
```

Run a small initial landing using a date range with one or a few known runs:

```bash
cd ../..
uv run python scripts/download_garmin_fit.py \
  --destination s3 \
  --mode range-overwrite \
  --start-date 2026-06-01 \
  --end-date 2026-06-07
```

`range-overwrite` deletes existing `.fit` objects under `garmin/fit` before
downloading the selected range. Use it for the initial baseline or intentional
rebuilds, not routine refreshes.

Confirm files landed:

```bash
aws s3 ls "s3://${GARMIN_FIT_S3_BUCKET}/garmin/fit/"
```

Then test incremental mode:

```bash
uv run python scripts/download_garmin_fit.py \
  --destination s3 \
  --mode incremental
```

After the S3 landing works, run the Databricks bronze ingestion jobs:

```bash
cd databricks
databricks bundle run --target dev garmin_fit_bronze_ingestion
databricks bundle run --target dev garmin_health_bronze_ingestion
```
