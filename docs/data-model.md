## Bronze Garmin FIT Tables

### garmin_fit_sessions

Run-level FIT session messages.

Grain: one row per Garmin running activity.

Key identifier:

- `run_id`

Important columns:

- `garmin_activity_id`
- `start_time`
- `timestamp`
- `run_date`
- `total_distance`
- `total_timer_time`
- `total_elapsed_time`
- `avg_heart_rate`
- `max_heart_rate`
- `enhanced_avg_speed`
- `enhanced_max_speed`
- source file metadata
- ingestion metadata

Partition column: `run_date`.

### garmin_fit_events

Filtered FIT event messages for timer boundaries and recovery heart rate.

Grain: one event row per run event timestamp.

Expected uniqueness:

- `run_id`
- `timestamp`
- `event`
- `event_type`

Partition column: `run_date`.

### garmin_fit_records

High-frequency FIT telemetry records.

Grain: one record row per run timestamp.

Expected uniqueness:

- `run_id`
- `timestamp`

Important columns:

- `distance`
- `heart_rate`
- `enhanced_speed`
- `enhanced_altitude`
- `cadence`
- `temperature`
- `position_lat`
- `position_long`
- `position_lat_deg`
- `position_long_deg`
- running dynamics fields where available

Partition column: `run_date`.

## Intermediate Models

### int_runs

Run-level analytical building block derived from `bronze.garmin_fit_sessions`.

Grain: one row per Garmin running activity.

Important columns:

- `run_id`
- `activity_id`
- `activity_date`
- `distance_km`
- `duration_seconds`
- `avg_pace_min_per_km`
- `speed_kmh`
- `avg_heart_rate`
- `max_heart_rate`
- source file metadata

## Gold Models

### signal_consistency

Weekly consistency metrics.

Grain: one row per calendar week.

### signal_volume

Weekly volume metrics.

Grain: one row per calendar week.

### signal_fitness

Run-level and period-level fitness indicators.

Includes:

- pace vs heart rate
- efficiency ratio
- comparable HR-band pace trends
- Garmin Recovery HR
- resting heart-rate trends

Grain: mixed analytical model, primarily one row per run with derived period fields.

### mart_running_signals

Presentation-ready table for the portfolio website.

Combines the latest consistency, volume, and fitness signals.
