{{ config(materialized='table') }}

select
    runs.activity_id,
    runs.activity_date,
    runs.distance_km,
    runs.duration_seconds,
    runs.avg_pace_min_per_km,
    runs.speed_kmh,
    runs.avg_heart_rate,
    runs.max_heart_rate,
    runs.garmin_recovery_hr
from {{ ref('runs') }} as runs
