# Running Signals

Running Signals is a live analytics engineering portfolio project using personal Garmin running data.

It extracts Garmin activity and daily health context with Python, lands recoverable raw files in S3,
loads bronze Delta tables in Databricks, transforms the data with dbt, and presents training signals
through a lightweight portfolio website.

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
  → Python FIT and health JSON downloaders
  → S3 raw FIT and health JSON landing zones
  → Databricks external Unity Catalog volume
  → Databricks bronze Delta tables
  → dbt silver building blocks
  → dbt gold signal and mart models
  → Supabase site read models
  → portfolio website
```

## Current State

Implemented project surfaces:

- Raw download scripts for Garmin FIT activities and daily health JSON payloads, with incremental
  refresh for routine runs and range overwrite for intentional backfills.
- Databricks Asset Bundle jobs for FIT and health bronze ingestion.
- dbt silver models for dates, runs, per-record telemetry, health days, and compatibility weeks.
- dbt gold models for daily, weekly, monthly, yearly, run, route, segment, signal, and
  prediction-ready feature outputs.
- A lightweight Next.js presentation layer under `apps/site`.

## Documentation

The `docs/` directory contains the deeper reviewer-facing documentation:

- [Project overview](docs/project-overview.md): scope, purpose, and signal groups.
- [Architecture](docs/architecture.md): raw landing, Databricks, dbt, and presentation flow.
- [Data model](docs/data-model.md): bronze, silver, and gold model contracts and lineage.
- [Signal definitions](docs/signal-definitions.md): implemented consistency, volume, fitness,
  route, and segment metrics.
- [Layer runbook](docs/layer-runbook.md): setup, refresh order, and validation commands.
- [Garmin data exploration](docs/garmin-data-exploration.md): source payload findings and field
  notes.
- [Technical decisions](docs/technical-decisions.md): key tradeoffs and rationale.

Related operational references:

- [Scripts README](scripts/README.md): downloader usage, S3 landing details, and smoke tests.
- [Terraform README](infra/terraform/README.md): AWS and Databricks infrastructure setup.
- [Site README](apps/site/README.md): presentation app commands.

## Operating The Pipeline

Use [docs/layer-runbook.md](docs/layer-runbook.md) for the complete
setup and refresh sequence across all layers:

1. Terraform infrastructure
2. raw S3 FIT and health landing
3. Databricks bronze ingestion
4. dbt silver and gold builds
5. dbt tests
6. Supabase site read-model sync

The order matters. A full dbt run requires both FIT bronze tables and
`bronze.garmin_health_daily_payloads`.
