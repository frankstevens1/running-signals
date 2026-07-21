## Recommended incremental refresh

```text
Daily GitHub Actions schedule
            │
            ▼
   1. Authenticate to Hetzner Object Storage
  2. Install project with uv
  3. Authenticate to Garmin
            │
            ├───────────────┐
            ▼               ▼
   FIT incremental     Health incremental
            │               │
            └───────┬───────┘
                    ▼
              Object storage raw landing
                    │
                    ▼
          Trigger Databricks workflow
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
     FIT bronze          Health bronze
          │                   │
          └─────────┬─────────┘
                    ▼
              dbt build + test
                    │
                    ▼
          Supabase site sync
                    │
                    ▼
               Next.js site
```

### 1. GitHub Actions starts

The workflow runs once per day, for example:

```text
05:15 UTC — Garmin raw refresh begins
```

It checks out the repository and runs:

```bash
uv sync --locked
```

It receives:

- Garmin credentials from GitHub secrets
- Hetzner Object Storage access key and secret key from GitHub secrets
- Object storage bucket configuration from workflow variables

### 2. FIT incremental refresh

The FIT downloader lists existing objects under:

```text
s3://bucket/garmin/fit/
```

It then asks Garmin for recent running activities.

For each activity:

```text
New activity
    → download original FIT file
    → write garmin/fit/{activity_id}.fit to object storage

Existing activity found
    → stop scanning
```

The existing implementation assumes Garmin returns activities newest first and uses the first existing FIT file as the incremental boundary ([download.py](/Users/frank/running-signals/ingest/garmin/download.py:226)).

If there are no existing FIT files, incremental mode fails intentionally. The first run should be a manual range backfill.

### 3. Health incremental refresh

The health downloader lists existing payload identities:

```text
(calendar_date, payload_type)
```

For each date, it checks four payload types:

```text
hrv
rhr
sleep
heart_rates
```

Missing payloads are fetched and written to:

```text
s3://bucket/garmin/health/daily/
  calendar_date=2026-07-13/hrv.json
  calendar_date=2026-07-13/rhr.json
  calendar_date=2026-07-13/sleep.json
  calendar_date=2026-07-13/heart_rates.json
```

Existing payloads are skipped. If a previous run fetched three of the four payloads successfully, the next run retries only the missing one.

### 4. Databricks bronze ingestion

Only after both raw download steps succeed should GitHub Actions trigger Databricks.

The FIT bronze job:

- Reads new or changed FIT files through the Unity Catalog volume
- Parses sessions, events, and records
- Skips unchanged files
- Replaces bronze rows when a source FIT file changed

The health bronze job:

- Reads new or changed JSON envelopes
- Compares source metadata
- Skips unchanged payloads
- Replaces changed payload rows

This preserves the current raw-to-bronze behavior documented in [architecture.md](/Users/frank/running-signals/docs/architecture.md:80).

### 5. dbt and presentation refresh

After both bronze jobs succeed:

```text
dbt run
dbt test
sync_site_supabase.py
```

The site then reads the refreshed Supabase `site_*` tables.

The current repository treats dbt and Supabase sync as separate commands, so making this fully automatic would require adding them as downstream workflow tasks.

### What happens when nothing changed?

A normal no-change run should look like:

```text
FIT:     0 files downloaded
Health:  0 payloads downloaded
Bronze:  no source changes
dbt:     optionally skipped
Site:    unchanged
```

To avoid unnecessary Databricks charges, the workflow should eventually expose machine-readable download counts and skip bronze/dbt when both downloaders report zero changes.

### Failure behavior

The important property is safe reruns:

```text
FIT succeeds
Health fails
    → no bronze trigger
    → next run skips FIT
    → next run retries missing health payloads

Raw landing succeeds
Bronze fails
    → next run skips unchanged raw files
    → bronze retries processing

Bronze succeeds
dbt fails
    → raw and bronze remain available
    → dbt can be rerun independently
```

Before enabling this, the health downloader should return a non-zero exit code when endpoint failures occur. Currently it prints endpoint failures but can still exit successfully ([download_garmin_health.py](/Users/frank/running-signals/scripts/download_garmin_health.py:330)).

`range-overwrite` should remain a manual backfill workflow and never be part of the daily incremental schedule.