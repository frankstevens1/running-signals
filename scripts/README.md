# Scripts

Small operational entrypoints for local project tasks. Keep scripts thin: argument parsing,
user prompts, and orchestration belong here; reusable logic should live under `ingest/`.

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

After the S3 landing works, run the Databricks bronze ingestion job:

```bash
cd databricks
uv run databricks bundle run garmin_fit_bronze_ingestion
```
