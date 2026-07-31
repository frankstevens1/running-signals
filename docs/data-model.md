# Data Model

This document describes the implemented analytical model contract for Running Signals.

## Modeling Principles

- Bronze tables are source-shaped, minimally transformed, and recoverable from Garmin FIT files and
  Garmin Connect health JSON payloads.
- Silver models are cleaned, typed, standardized analytical building blocks.
- Gold models own signal definitions, rollups, and presentation-ready marts.
- The primary analytical grain is the completed calendar day. Weekly, monthly, and yearly
  outputs are rollups from `mart_days`, not the base modeling grain.
- The unified daily mart (`mart_days`) brings together FIT training outcomes and Garmin Connect
  health context on the same calendar-date spine. Health data is LEFT JOINed; missing health
  observations remain null and are flagged with per-endpoint availability booleans.
- Session, record, segment, and route grains remain explicit so route and performance analysis does
  not leak raw second-level telemetry into every presentation output.
- Silver-level intermediary models (`dates`, `runs`, `run_records`, `health_days`) are internal
  building blocks, not directly queryable analytical grains.

## Canonical Grains

| Grain | Model | Key |
|---|---|---|
| Day | `mart_days` | `calendar_date` |
| Week | `mart_weeks` | `week_start_date` |
| Month | `mart_months` | `month_start_date` |
| Year | `mart_years` | `year_start_date` |
| Run session | `mart_run_sessions` | `run_id` |
| Record telemetry | `mart_activity_records` | `run_id`, `record_index` |
| Map profile point | `mart_map_profile_records` | `run_id`, `record_index` |
| Analytical segment | `mart_run_segments` | `run_id`, `unit_system`, `segment_length_value`, `segment_index` |
| Route profile | `mart_routes` | `route_id` |

## Intermediate Models

These models support the canonical grain models above. They are not intended for direct analytical
querying and do not carry their own grain.

| Model | Purpose |
|---|---|
| `dates` | Calendar-day spine from the first observed Garmin date through yesterday |
| `runs` | Canonical session-level building block with standardized FIT metrics |
| `health_days` | Pivoted daily health context from Garmin Connect JSON payloads |
| `run_records` | Cleaned per-record telemetry with H3 cells and WKT geometry |
| `route_observations` | One row per GPS-backed run with 250m H3 path signature |
| `route_similarity_edges` | Bidirectional graph of similar route pairs above 90% Jaccard threshold |
| `int_route_component_roots` | Connected-component partial roots after 6 rounds of chronological pointer-jumping |
| `mart_route_clusters` | Route identity assignment via similarity-based clustering with 6 additional pointer-jumping rounds |
| `mart_segment_resolutions` | Static 6-row lookup defining metric and imperial segment lengths |
| `int_daily_streaks` | Single-row aggregate of daily run streaks and training breaks |
| `int_current_week_aligned` | Current ISO week-to-date aggregation |

## Lineage

```text
bronze.garmin_fit_sessions
    -> runs
bronze.garmin_fit_events
    -> runs
bronze.garmin_fit_records
    -> run_records
bronze.garmin_health_daily_payloads
    -> health_days
runs
    -> dates
dates + runs + health_days
    -> mart_days
mart_days
    -> mart_weeks
    -> mart_months
    -> mart_years
mart_weeks
    -> mart_weekly_training_features
run_records
    -> mart_activity_records
mart_activity_records
    -> mart_map_profile_records
run_records + mart_segment_resolutions
    -> mart_run_segments
runs + run_records
    -> route_observations
route_observations
    -> route_similarity_edges
route_observations + route_similarity_edges
    -> int_route_component_roots
    -> mart_route_clusters
runs + mart_days + mart_run_segments + mart_route_clusters
    -> mart_run_sessions
mart_run_sessions
    -> mart_routes
mart_run_sessions + mart_routes
    -> mart_route_prediction_features
runs + mart_run_segments
    -> signal_fitness
signal_fitness + mart_weeks
    -> mart_running_signals
mart_days
    -> int_daily_streaks
    -> int_current_week_aligned
FIT gold presentation outputs
    -> Supabase site_*_core tables
```

## Presentation Read Models

Supabase FIT core tables mirror the public-facing running fields used by the Next.js site.
Public views over the core tables provide the `site_*` API surface. Ordered activity records
provide map geometry; analytical segment endpoints are not a route reconstruction format. The
serving relations are not a replacement for the Databricks/dbt model contracts.

Health fields are available in Databricks `mart_days` for offline analysis. The Supabase surface
is FIT-only; health context is not served to the presentation layer.

## Bronze Tables

The dbt source contract contains only the four tables created by the current FIT and health bronze
ingestion jobs. It does not declare the retired Garmin Connect activity-summary or
activity-detail tables. Source tests enforce the required identifiers used by downstream models,
the FIT session `run_id` grain, the allowed health payload types, and the health payload
`calendar_date` + `payload_type` grain.

The downstream test suite separately validates declared model keys, parent relationships, and the
business rules for ordered activity records, configured segment resolutions, segment allocation,
route-match similarity, cadence, and recovery-heart-rate ranges. The activity-record key-parity
test is the sole preservation assertion between silver and its presentation-safe gold projection;
the former per-run row-count comparison was redundant because exact key parity is stricter.

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

### dates

Grain: one row per completed calendar day from the first observed Garmin date through yesterday.

Purpose: provide the day spine used by all daily, weekly, monthly, and yearly rollups. It carries
calendar attributes such as week, month, quarter, year, and weekend flags.

### runs

Grain: one row per Garmin running activity.

Purpose: provide the canonical session-level run building block. It standardizes distance, duration,
pace, speed, heart rate, cadence, ascent/descent, session endpoints, record counts, GPS coverage, and
record-derived start/end coverage fields. Garmin Recovery HR is joined from the latest bronze FIT
`recovery_hr` event for the run when Garmin includes one. The FIT event stores the post-recovery
heart rate; `runs.garmin_recovery_hr` stores the drop from the latest recorded run heart rate
to that event value. Session cadence is normalized from Garmin's per-leg cadence to total steps per
minute.

### run_records

Grain: one row per `run_id` and `record_timestamp`.

Purpose: provide cleaned per-record telemetry with elapsed seconds, cumulative distance, speed, pace,
heart rate, cadence, altitude, latitude/longitude, H3 cells, and WKT point text. The model uses
Databricks-native SQL/H3 functions and does not introduce Python geospatial dependencies. Record
cadence is normalized from Garmin's per-leg cadence to total steps per minute.

### health_days

Grain: one row per calendar date.

Purpose: provide canonical daily fitness-context fields from Garmin Connect JSON while preserving
endpoint availability flags. This model is an internal silver building block; it joins into
`mart_days` at the gold layer rather than serving as a standalone presentation mart.

## Gold Models

### mart_days

Grain: one row per completed calendar day.

Purpose: primary daily training mart with run count, distance, duration, active/missed day flags,
same-day Garmin Connect health context (resting heart rate, HRV, sleep score, and per-endpoint
availability flags), rolling 7-day and 28-day training windows, and rolling 7-day and 30-day
resting-heart-rate windows.

### mart_weeks, mart_months, mart_years

Grain: one row per completed week, observed month, or observed year.

Purpose: roll up `mart_days` into coarser calendar outputs. Weekly metrics include active-week
streaks, missed-week flags, and rolling 4-week and 12-week distance and run-count windows.

### signal_fitness

Grain: one row per run.

Purpose: define descriptive aerobic fitness indicators from session pace, speed, heart rate,
heart-rate bands, first-half versus second-half heart-rate drift, Garmin Recovery HR when available,
and same-day health context.

### mart_weekly_training_features

Grain: one row per completed week.

Purpose: provide prediction-ready weekly feature and label columns with lag and lead windows for
prior and next week values. Intended for offline ML experimentation.

### mart_running_signals

Grain: one row per run.

Purpose: combine run-level `signal_fitness` metrics with week-level context from `mart_weeks`,
providing a single-table view of per-run fitness indicators alongside the containing week's
volume, consistency, and streak information.

### mart_segment_resolutions

Grain: one row per `unit_system` and `segment_length_value`.

Purpose: configure the metric and imperial quarter, half, and full split progression. Each row keeps
an exact canonical `segment_length_m`, a display label, and the canonical marker used to protect
existing downstream calculations. Additional resolutions require a new row rather than a segment
model redesign.

### mart_activity_records

Grain: one row per `run_id` and `record_index`.

Purpose: publish the ordered, presentation-safe activity telemetry needed to render complete route
geometry and within-run charts. It retains every silver record, including rows without coordinates,
so consumers can preserve ordering and avoid reconnecting separate GPS sequences across gaps.

### mart_map_profile_records

Grain: at most 500 rows per `run_id`, uniquely ordered by `record_index`.

Purpose: provide the narrow presentation projection published to Supabase. Runs with at most 500
records retain every row; longer runs retain 500 deterministic, evenly distributed record positions,
including the first and last. Distance, altitude, pace, heart rate, and route coordinates support the
map and within-run profile tooltip. Complete telemetry remains in `mart_activity_records` for
Databricks analysis.

### mart_run_segments

Grain: one row per run, unit system, configured segment length, and segment index.

Purpose: expose curated within-run analytics from record telemetry at 0.25, 0.5, and 1 kilometre or
mile resolutions. Cumulative distance is made monotonic with a running maximum. Each record-to-record
interval is allocated to every crossed segment by distance overlap; elapsed time uses the same
proportion. Stationary or source-correction intervals contribute zero distance and assign their full
elapsed time to the segment containing the interval endpoint.

Distance zero belongs to segment 1, and analytical segments use lower-exclusive, upper-inclusive
boundaries. Exact-boundary finishes therefore complete the preceding segment without creating a
zero-distance trailing row. Segment speed and pace derive from allocated distance and duration.
Heart rate and cadence use weighted, linearly interpolated interval values; boundary altitude and
coordinates are interpolated when both adjacent records provide them.

### mart_route_clusters

Grain: one row per GPS-backed run with route geometry.

Purpose: assign similarity-based, direction-specific route identity before session-level enrichment.
The model builds its preserved legacy 250m floor-bucketed H3 path directly from
`run_records`; it does not depend on analytical segment indices. This retains existing route
hashes, the one-segment positional tolerance, and the 90% minimum overlap score after a 10% distance
prefilter while allowing split allocation to improve independently. The representative route is the
earliest directly matching observed run. Its resolution-9 H3 signature and 0.5 km distance bucket
generate the stable `route_id` used downstream. Presentation maps use `mart_activity_records`, not
either H3 path.

Representative cells retain the lowest-distance record in each legacy bucket. Equal cumulative
distances are resolved by `record_index`, replacing the previous undefined `min_by` tie behavior so
future recomputations remain deterministic.

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
