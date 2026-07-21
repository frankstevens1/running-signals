# Scripts

Small operational entrypoints for local project tasks. Keep scripts thin: argument parsing,
user prompts, and orchestration belong here; reusable logic should live under `ingest/`.

For the full raw-to-bronze-to-silver-to-gold workflow, use
`docs/layer-runbook.md`. This file documents the script entrypoints; the runbook
documents the required execution order.

## `download_garmin_fit.py`

Downloads Garmin running activities as raw `.fit` files.

S3-compatible object storage (Hetzner) is the production destination. Files are written using this object layout:

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
  object storage, deletion is limited to keys under the configured prefix.

Examples:

```bash
uv run python scripts/download_garmin_fit.py --destination s3 --mode range-overwrite --start-date 2026-01-01 --end-date 2026-12-31
uv run python scripts/download_garmin_fit.py --destination s3 --mode incremental
uv run python scripts/download_garmin_fit.py --destination local --mode range-overwrite --start-date 2026-01-01 --end-date 2026-12-31
```

Garmin credentials are read from the token store when available. If stored tokens
are unavailable, the underlying client prompts for Garmin credentials.

S3-compatible object storage configuration is read from CLI arguments first, then from the repository
`.env` file or shell environment:

- `GARMIN_FIT_S3_BUCKET`
- `GARMIN_FIT_S3_PREFIX`, defaulting to `garmin/fit`
- `OBJECT_STORAGE_ENDPOINT_URL`, defaulting to `https://nbg1.your-objectstorage.com`
- `OBJECT_STORAGE_ACCESS_KEY_ID`
- `OBJECT_STORAGE_SECRET_ACCESS_KEY`
- `OBJECT_STORAGE_REGION`, defaulting to `nbg1`

## `download_garmin_health.py`

Downloads daily Garmin Connect health JSON payloads for HRV, resting heart rate,
sleep, and heart-rate summaries.

S3-compatible object storage is the production destination. Files are written as recoverable JSON
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

S3-compatible object storage configuration is read from CLI arguments first, then from the repository
`.env` file or shell environment:

- `GARMIN_HEALTH_S3_BUCKET`, falling back to `GARMIN_FIT_S3_BUCKET`
- `GARMIN_HEALTH_S3_PREFIX`, defaulting to `garmin/health/daily`
- `OBJECT_STORAGE_ENDPOINT_URL`, defaulting to `https://nbg1.your-objectstorage.com`
- `OBJECT_STORAGE_ACCESS_KEY_ID`
- `OBJECT_STORAGE_SECRET_ACCESS_KEY`
- `OBJECT_STORAGE_REGION`, defaulting to `nbg1`

## `sync_site_supabase.py`

Reloads the Supabase `site_*` presentation read models from Databricks gold tables. Run it only after
dbt has successfully built and tested the gold layer.

```bash
uv run python scripts/sync_site_supabase.py --dry-run
uv run python scripts/sync_site_supabase.py
```

The sync is a full snapshot refresh, not an append-only import: each destination table is
copied to a temporary staging table in 10,000-row batches, checked, then atomically replaced.
If the Supabase connection drops, the affected table is retried from the full snapshot and the
previous live table remains available until a replacement commits. Tune a constrained connection
with `--batch-size 5000`; use `--load-attempts 5` when transient database disconnects are expected.

Configuration is read from the repository `.env` file or shell environment:

- `DATABRICKS_HOST`
- `DATABRICKS_TOKEN`
- `DATABRICKS_HTTP_PATH`
- `DATABRICKS_CATALOG`
- `DATABRICKS_GOLD_SCHEMA`
- `DATABRICKS_TABLE_SUFFIX`, defaulting to `__pre_sprint3`

For local development, `SUPABASE_DB_URL` is not required. The script defaults to the Supabase CLI
database at `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. For hosted Supabase, set
`SUPABASE_DB_URL` to a direct database connection with write privileges.

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are site runtime variables and belong in `apps/site/.env.local`
or the site deployment environment, not in the root operational `.env`.

## Object Storage Credentials

Hetzner Object Storage uses access key / secret key pairs, not AWS IAM.

Generate credentials at:

1. Open [Hetzner Console](https://console.hetzner.com/) and select your project.
2. Go to **Security -> S3 Credentials**.
3. Click **Generate credentials**, enter a description, and copy the keys.
4. Set `OBJECT_STORAGE_ACCESS_KEY_ID` and `OBJECT_STORAGE_SECRET_ACCESS_KEY` in `.env`.

Local smoke tests:

```bash
uv run python scripts/download_garmin_health.py --destination s3 --mode incremental
```

For unattended automation (GitHub Actions, scheduled jobs), pass the access key and
secret key as secrets to the job runtime. Hetzner credentials do not expire unless
you revoke them in the Console.

Garmin authentication is a separate automation concern. For production refresh jobs, pass a valid,
writable token store with `--tokenstore` from a secret-backed path outside the repository so refreshed
tokens can be persisted. Alternatively, provide non-interactive `GARMIN_EMAIL` and `GARMIN_PASSWORD`
values through the runtime secret manager.

## Object Storage Landing Smoke Test

Run this after `infra/terraform` has successfully created the external volume.

From `infra/terraform`, confirm the expected volume output exists:

```bash
terraform output garmin_fit_volume_path
```

Expected:

```text
"/Volumes/running_signals/bronze/raw_garmin/fit"
```

Export the object storage settings from the Terraform outputs:

```bash
export GARMIN_FIT_S3_BUCKET="$(terraform output -raw raw_bucket_name)"
export GARMIN_FIT_S3_PREFIX="garmin/fit"
export OBJECT_STORAGE_ENDPOINT_URL="https://nbg1.your-objectstorage.com"
export OBJECT_STORAGE_ACCESS_KEY_ID="<your-access-key>"
export OBJECT_STORAGE_SECRET_ACCESS_KEY="<your-secret-key>"
export OBJECT_STORAGE_REGION="nbg1"
```

Verify access with the MinIO Client or `s3cmd`:

```bash
mc ls "nbg1/${GARMIN_FIT_S3_BUCKET}/"
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
mc ls "nbg1/${GARMIN_FIT_S3_BUCKET}/garmin/fit/"
```

Then test incremental mode:

```bash
uv run python scripts/download_garmin_fit.py \
  --destination s3 \
  --mode incremental
```

After the object storage landing works, run the Databricks bronze ingestion jobs:

```bash
cd databricks
uv run databricks bundle run garmin_fit_bronze_ingestion
uv run databricks bundle run garmin_health_bronze_ingestion
```
