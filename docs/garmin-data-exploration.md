# Garmin Data Exploration

`notebooks/exploration/garmin_payload_exploration.ipynb` is an exploration and validation notebook.
It parses local Garmin FIT files through reusable code in `ingest/garmin`, inventories
available fields, checks coverage, and saves representative samples under
`data/raw/garmin/exploration`.

Production ingestion should not copy notebook logic inline. Stable parsing, metadata enrichment,
validation, and Databricks writes belong in the `ingest/garmin` package.

Databricks job notebooks live separately under `notebooks/jobs` and are the only notebooks included
in the Databricks Asset Bundle. Exploration notebooks are committed for transparency, but they are
local-only project evidence. Notebook filenames are descriptive rather than sequence-numbered because
the directory already communicates whether a notebook is exploratory or operational.

The first productionized FIT entities are:

- `sessions`
- `events`
- `records`

Their Databricks bronze tables are:

- `bronze.garmin_fit_sessions`
- `bronze.garmin_fit_events`
- `bronze.garmin_fit_records`
