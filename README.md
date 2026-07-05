# Running Signals

Running Signals is a live analytics engineering portfolio project using personal Garmin running data.

It extracts Garmin activity and daily health context with Python, stores it in Databricks Delta tables, transforms it with dbt, and presents training signals through a lightweight portfolio website.

## Purpose

This project is designed to demonstrate practical analytics engineering skills:

- Python ingestion
- Databricks lakehouse modeling
- Delta-based storage
- dbt transformations, tests, docs, and lineage
- SQL analytical modeling
- clear technical communication
- minimal public-facing presentation

## Analytical Focus

The project models three running signal groups:

1. Consistency
2. Volume
3. Fitness

Fitness focuses on pace/heart-rate efficiency, Garmin Recovery HR when it is available in FIT event
payloads, and descriptive daily context from Garmin Connect health JSON such as resting heart rate,
HRV, and sleep score. These daily fields are context only; the project does not define readiness,
coaching, or medical signals.

## Architecture

```txt
Garmin Connect
  → Python extractor
  → S3 raw FIT and health JSON landing zones
  → Databricks external Unity Catalog volume
  → Databricks bronze Delta tables
  → dbt silver models
  → dbt gold signal and mart models
  → portfolio website
```

## Operating The Pipeline

Use [docs/layer-runbook.md](docs/layer-runbook.md) for the complete
setup and refresh sequence across all layers:

1. Terraform infrastructure
2. raw S3 FIT and health landing
3. Databricks bronze ingestion
4. dbt silver and gold builds
5. dbt tests

The order matters. A full dbt run requires both FIT bronze tables and
`bronze.garmin_health_daily_payloads`.
