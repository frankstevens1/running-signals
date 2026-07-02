# Running Signals

Running Signals is a live analytics engineering portfolio project using personal Garmin running data.

It extracts Garmin activity data with Python, stores it in Databricks Delta tables, transforms it with dbt, and presents training signals through a lightweight portfolio website.

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

Fitness combines pace/heart-rate efficiency, Garmin Recovery HR, and resting heart-rate trends.

## Architecture

```txt
Garmin Connect
  → Python extractor
  → S3 raw FIT landing zone
  → Databricks external Unity Catalog volume
  → Databricks bronze Delta tables
  → dbt silver models
  → dbt gold signal marts
  → portfolio website
```
