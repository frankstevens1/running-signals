# Architecture

Running Signals uses a simple analytics engineering flow:

```text
Garmin Connect / FIT exports
    -> Python ingestion
    -> S3 raw FIT landing zone
    -> Databricks external Unity Catalog volume
    -> Databricks bronze Delta tables
    -> dbt silver and gold models
    -> presentation layer
```

## Garmin FIT Bronze Ingestion

Production Garmin FIT ingestion lives in reusable Python modules under `ingest/garmin`.
The exploration notebook under `notebooks/exploration` remains a validation asset and does not
contain production parsing or write logic. Job entrypoint notebooks live under `notebooks/jobs` and
are included in the Databricks Asset Bundle.

The Python downloader writes raw Garmin FIT files to the canonical S3 landing zone:

```text
s3://<bucket>/garmin/fit/{garmin_activity_id}.fit
```

Databricks accesses the same objects through an external Unity Catalog volume:

```text
/Volumes/running_signals/bronze/raw_garmin/fit/{garmin_activity_id}.fit
```

The Databricks bronze job reads `.fit` files from that volume path, parses them with the same
reusable FIT parser used by the exploration notebook, enriches the parsed entities with source
metadata, validates required fields, and writes Delta tables in the `bronze` schema.

Bronze tables:

- `bronze.garmin_fit_sessions`
- `bronze.garmin_fit_events`
- `bronze.garmin_fit_records`

All three tables carry:

- `run_id`
- `garmin_activity_id`
- `run_date`
- source file metadata
- ingestion metadata

`run_date` is derived from the session `start_time` and is the Delta partition column. `ingestion_date`
is retained only as operational metadata.

## Infrastructure Setup

Terraform under `infra/terraform` creates the raw S3 bucket and the Unity Catalog objects that expose
it to Databricks:

- S3 bucket, defaulting to `running-signals-raw-${aws_account_id}`
- IAM role and policy for Unity Catalog access to the Garmin prefix
- catalog: `running_signals`
- cleanup of the auto-created `running_signals.default` schema
- schema: `bronze`
- storage credential for the IAM role
- external location for `s3://<bucket>/garmin`
- external location for `s3://<bucket>/__databricks_managed/running_signals`
- catalog managed storage root at `s3://<bucket>/__databricks_managed/running_signals`
- external volume: `running_signals.bronze.raw_garmin`

Required local authentication:

- A verified AWS CLI profile with permission to create S3 and IAM resources. Run
  `AWS_PROFILE=<profile> aws sts get-caller-identity` before Terraform; see
  `infra/terraform/README.md` for the profile-first setup.
- Databricks CLI/profile or environment-variable auth with permission to create Unity Catalog storage
  objects.
- A two-pass Databricks storage credential bootstrap. The first Terraform apply uses a placeholder
  external ID with validation skipped; the second apply uses the real Databricks-generated external
  ID and turns validation on. The exact runbook is in `infra/terraform/README.md`.

Apply the infrastructure:

```bash
cd infra/terraform
terraform init
terraform plan
terraform apply
terraform output storage_credential_external_id
# update terraform.tfvars with that output and set skip_databricks_validation = false
terraform plan
terraform apply
```

The Databricks job expects the bronze schema and raw FIT external volume to exist before the first
run. The current development defaults are defined in `databricks/databricks.yml`:

- catalog: `running_signals`
- schema: `bronze`
- source FIT path: `/Volumes/running_signals/bronze/raw_garmin/fit`

## FIT Landing

Each FIT object key should use the Garmin activity id:

```text
garmin/fit/21523624126.fit
```

The ingestion job uses the filename stem as both `run_id` and `garmin_activity_id`. It does not
download from Garmin directly; it only ingests files that have already landed in S3 and are visible
through the external volume.

For the initial S3 landing:

```bash
uv run python scripts/download_garmin_fit.py --destination s3 --mode range-overwrite --start-date <date> --end-date <date>
```

The full post-Terraform S3 landing smoke test, including environment variables and AWS checks, is in
`scripts/README.md`.

For an incremental refresh:

```bash
uv run python scripts/download_garmin_fit.py --destination s3 --mode incremental
cd databricks
uv run databricks bundle run garmin_fit_bronze_ingestion
```

Local filesystem output remains available only for development and exploration:

```bash
uv run python scripts/download_garmin_fit.py --destination local --mode range-overwrite --start-date <date> --end-date <date>
```

## Databricks Jobs

The Databricks Asset Bundle defines a paused daily serverless job. Validate and deploy it from the
`databricks/` directory:

```bash
cd databricks
uv run databricks bundle validate
uv run databricks bundle deploy
```

Run the job manually once after uploading FIT files. Leave the schedule paused until the first manual
run creates the expected bronze tables.

## Incremental Behavior

The daily Databricks job compares available FIT files with existing bronze session metadata. New or
changed files are parsed and written. Unchanged files are skipped.

When a previously ingested FIT file changes, the job deletes that `run_id` from all three bronze FIT
tables before appending the replacement rows. This keeps repeated job runs idempotent without adding
heavier orchestration.
