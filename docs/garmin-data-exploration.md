# Garmin Data Exploration

`notebooks/exploration/garmin_payload_exploration.ipynb` is an exploration and validation notebook.
It stages Garmin FIT files and health JSON payloads from the configured S3 raw landing prefixes,
parses them through reusable code in `ingest/garmin`, inventories available fields, checks coverage,
and saves representative samples under
`data/raw/garmin/exploration`.

Production ingestion should not copy notebook logic inline. Stable parsing, metadata enrichment,
validation, and Databricks writes belong in the `ingest/garmin` package.

Databricks job notebooks live separately under `notebooks/jobs` and are the only notebooks included
in the Databricks Asset Bundle. Exploration notebooks are committed for transparency, but they are
local-only project evidence.

The notebook covers two raw Garmin payload families.

FIT activity files are parsed into:

- `sessions`
- `events`
- `records`

FIT files are loaded from the S3 raw landing layout:

```text
s3://<bucket>/garmin/fit/{garmin_activity_id}.fit
```

Daily health JSON payloads are loaded from the S3 raw landing layout:

```text
s3://<bucket>/garmin/health/daily/calendar_date=YYYY-MM-DD/{payload_type}.json
```

where `{payload_type}` is one of:

- `hrv`
- `rhr`
- `sleep`
- `heart_rates`

The production Databricks bronze tables are:

- `bronze.garmin_fit_sessions`
- `bronze.garmin_fit_events`
- `bronze.garmin_fit_records`
- `bronze.garmin_health_daily_payloads`

The health exploration validates daily payload availability, endpoint coverage, nested JSON key
coverage, and candidate extraction paths used by `health_days`. Production health ingestion
and parsing remain in `ingest/garmin` and dbt silver models.
