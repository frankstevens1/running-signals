# Scripts

Small operational entrypoints for local project tasks. Keep scripts thin: argument parsing,
user prompts, and orchestration belong here; reusable logic should live under `ingest/`.

For the full raw-to-bronze-to-silver-to-gold workflow, use
`docs/layer-runbook.md`. This file documents the script entrypoints; the runbook
documents the required execution order.

## `download_garmin_fit.py`

Downloads Garmin running activities as raw `.fit` files.

S3 is the production destination. Files are written using this object layout:

```text
s3://<bucket>/garmin/fit/{garmin_activity_id}.fit
```

Local filesystem output remains available only for development and exploration.

Modes:

- `incremental`: appends new runs to an existing destination. This stops when it
  reaches the first activity that already exists, so it requires at least one
  existing `.fit` file.
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
payloads for that day.

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

Reloads the Supabase `site_*` presentation read models from Databricks gold tables. Run it only after
dbt has successfully built and tested the gold layer.

```bash
uv run python scripts/sync_site_supabase.py --dry-run
uv run python scripts/sync_site_supabase.py
```

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
short-lived non-interactive credentials, preferably GitHub Actions OIDC assuming a scoped AWS IAM
role. Running inside AWS with an instance, task, or Lambda role is also acceptable. A dedicated IAM
user access key is a fallback only if the policy is tightly scoped to the raw Garmin landing prefixes
and the key is rotated.

Garmin authentication is a separate automation concern. The downloader needs a valid token store or
non-interactive `GARMIN_EMAIL` and `GARMIN_PASSWORD` values. The token store must remain outside the
repository.

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
uv run databricks bundle run garmin_fit_bronze_ingestion
uv run databricks bundle run garmin_health_bronze_ingestion
```
