{{ config(materialized='table') }}

select
    activity_id,
    activity_date,
    distance_km,
    duration_seconds,
    avg_pace_min_per_km,
    speed_kmh,
    avg_heart_rate,
    max_heart_rate,
    garmin_recovery_hr,
    resting_hr_7d_avg,
    resting_hr_30d_avg
from {{ ref('int_runs') }}
