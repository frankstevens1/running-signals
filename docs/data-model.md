# Data Model

This document describes the implemented analytical model contract for Running Signals.

## Modeling Principles

- Bronze tables are source-shaped, minimally transformed, and recoverable from Garmin FIT files and
  Garmin Connect health JSON payloads.
- Silver models are cleaned, typed, standardized analytical building blocks.
- Gold models own signal definitions, rollups, and presentation-ready marts.
- The primary analytical grain is the completed calendar day. Weekly, monthly, and yearly
  outputs are rollups from `mart_days`, not the base modeling grain.
- Session, record, segment, and route grains remain explicit so route and performance analysis does
  not leak raw second-level telemetry into every presentation output.

## Canonical Grains

| Grain | Model | Key |
|---|---|---|
| Day | `silver_dates`, `mart_days` | `calendar_date` |
| Run session | `silver_runs`, `mart_run_sessions` | `run_id` / `activity_id` |
| Record telemetry | `silver_run_records` | `run_id`, `record_timestamp` |
| Fixed segment | `mart_run_segments` | `run_id`, `segment_index` |
| Route observation | `mart_route_clusters` | `run_id` |
| Route profile | `mart_routes` | `route_id` |
| Week | `mart_weeks` | `week_start_date` |
| Month | `mart_months` | `month_start_date` |
| Year | `mart_years` | `year_start_date` |

## Lineage

```text
bronze.garmin_fit_sessions
    -> silver_runs
bronze.garmin_fit_events
    -> silver_runs
bronze.garmin_fit_records
    -> silver_run_records
bronze.garmin_health_daily_payloads
    -> silver_health_days
silver_runs + silver_health_days
    -> silver_dates
silver_dates + silver_runs + silver_health_days
    -> mart_days
mart_days
    -> mart_weeks
    -> mart_months
    -> mart_years
mart_weeks
    -> signal_consistency
    -> signal_volume
    -> mart_weekly_training_features
silver_run_records
    -> mart_run_segments
silver_runs + mart_run_segments
    -> mart_route_clusters
silver_runs + mart_days + mart_run_segments + mart_route_clusters
    -> mart_run_sessions
mart_run_sessions
    -> mart_routes
mart_run_sessions + mart_routes
    -> mart_route_prediction_features
silver_runs + silver_health_days
    -> signal_fitness
    -> mart_runs
    -> mart_running_signals
gold presentation outputs
    -> Supabase site_* read models
```

`silver_weeks`, `signal_consistency`, `signal_volume`, `mart_weeks`, `mart_running_signals`, and
`mart_weekly_training_features` remain as compatibility outputs, but their weekly logic is downstream
of the daily foundation.

## Presentation Read Models

Supabase `site_*` tables mirror the public-facing gold fields used by the Next.js site. They are
loaded after dbt succeeds and are optimized for low-latency reads, filtering, sorting, charts, and
route maps. They are intentionally not a replacement for the Databricks/dbt model contracts.

## Bronze Tables

### bronze.garmin_fit_sessions

Grain: one row per Garmin running activity session.

Purpose: preserve run-level FIT session fields with source and ingestion metadata.

Important columns include `run_id`, `garmin_activity_id`, `start_time`, `timestamp`, `run_date`,
`total_distance`, `total_timer_time`, `avg_heart_rate`, `max_heart_rate`, start/end coordinates,
source file metadata, and ingestion metadata.

### bronze.garmin_fit_records

Grain: one record row per run timestamp.

Purpose: preserve high-frequency FIT telemetry for per-record, segment, route, and within-run
analytics.

Important columns include `run_id`, `timestamp`, `distance`, `heart_rate`, `enhanced_speed`,
`enhanced_altitude`, `cadence`, `position_lat_deg`, and `position_long_deg`.

### bronze.garmin_fit_events

Grain: one event row per run event timestamp.

Purpose: preserve FIT event messages, including timer boundaries and Garmin Recovery HR events when
they are present in the activity file. Recovery HR extraction remains nullable because event payload
availability varies by device and activity.

### bronze.garmin_health_daily_payloads

Grain: one row per `calendar_date` and Garmin health `payload_type`.

Purpose: preserve recoverable Garmin Connect daily health JSON payloads for same-day training
context. Endpoint availability varies, so missing values remain null and availability flags are
exposed in silver and gold.

## Silver Models

### silver_dates

Grain: one row per completed calendar day from the first observed Garmin date through yesterday.

Purpose: provide the day spine used by all daily, weekly, monthly, and yearly rollups. It carries
calendar attributes such as week, month, quarter, year, and weekend flags.

### silver_runs

Grain: one row per Garmin running activity.

Purpose: provide the canonical session-level run building block. It standardizes distance, duration,
pace, speed, heart rate, cadence, ascent/descent, session endpoints, record counts, GPS coverage, and
record-derived start/end coverage fields. Garmin Recovery HR is joined from the latest bronze FIT
`recovery_hr` event for the run when Garmin includes one. The FIT event stores the post-recovery
heart rate; `silver_runs.garmin_recovery_hr` stores the drop from the latest recorded run heart rate
to that event value. Session cadence is normalized from Garmin's per-leg cadence to total steps per
minute.

### silver_run_records

Grain: one row per `run_id` and `record_timestamp`.

Purpose: provide cleaned per-record telemetry with elapsed seconds, cumulative distance, speed, pace,
heart rate, cadence, altitude, latitude/longitude, H3 cells, and WKT point text. The model uses
Databricks-native SQL/H3 functions and does not introduce Python geospatial dependencies. Record
cadence is normalized from Garmin's per-leg cadence to total steps per minute.

### silver_health_days

Grain: one row per calendar date.

Purpose: provide canonical daily fitness-context fields from Garmin Connect JSON while preserving
endpoint availability flags.

### silver_weeks

Grain: one row per completed calendar week.

Purpose: compatibility week spine derived from `silver_dates` and `silver_runs`. New analytical work
should prefer `mart_days` and its downstream rollups.

## Gold Models

### mart_days

Grain: one row per completed calendar day.

Purpose: primary daily training mart with run count, distance, duration, active/missed day flags,
same-day health context, and rolling 7-day and 28-day training windows.

### mart_weeks, mart_months, mart_years

Grain: one row per completed week, observed month, or observed year.

Purpose: roll up `mart_days` into coarser calendar outputs. Weekly consistency and volume metrics
are retained here for compatibility and portfolio charts.

### signal_consistency and signal_volume

Grain: one row per completed calendar week.

Purpose: compatibility signal models sourced from `mart_weeks`. These models preserve the existing
weekly interface while making `mart_days` the foundation.

### signal_fitness

Grain: one row per run.

Purpose: define descriptive aerobic fitness indicators from session pace, speed, heart rate,
heart-rate bands, first-half versus second-half heart-rate drift, Garmin Recovery HR when available,
and same-day health context.

### mart_run_segments

Grain: one row per run and fixed 250m segment.

Purpose: expose curated within-run analytics from record telemetry: segment pace, duration, heart
rate, cadence, elevation change, grade, coordinates, and representative H3 cells. Segment cadence is
based on the normalized total-steps-per-minute record cadence. Segment metrics remain nullable when
the underlying FIT records do not include positive distance deltas, heart rate, cadence, or altitude
telemetry.

### mart_route_clusters

Grain: one row per GPS-backed run with route geometry.

Purpose: assign similarity-based, direction-specific route identity before session-level enrichment.
Routes are compared as ordered resolution-8 H3 segment paths, with a one-segment positional
tolerance and a 90% minimum overlap score after a 10% distance prefilter. The representative route is
the earliest directly matching observed run. Its resolution-9 H3 signature and 0.5 km distance
bucket generate the stable `route_id` used downstream.

### mart_run_sessions

Grain: one row per run.

Purpose: combine session outcomes, daily health context, recent training context, route identity,
record coverage, and route profile summaries. This is the preferred run-level mart for route and
performance analysis.

### mart_routes

Grain: one row per detected route profile.

Purpose: summarize historical outcomes and route characteristics for a stable `route_id`. The route
identifier is inherited from `mart_route_clusters`, so small GPS jitter and short detours can share a
route when ordered segment overlap remains at or above 90%. It is intended for analytical grouping,
not survey-grade GIS.

### mart_route_prediction_features

Grain: one row per run-route observation.

Purpose: provide transparent feature and label columns for future predictive modeling experiments:
route characteristics, recent training context, prior route history, and outcome labels such as
pace, duration, average heart rate, and completion distance. It does not train a model or generate
forecasts, readiness scores, or coaching recommendations.
