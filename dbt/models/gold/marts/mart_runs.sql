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
    runs.garmin_recovery_hr,
    health_days.resting_heart_rate,
    health_days.hrv_value,
    health_days.hrv_status,
    health_days.sleep_score,
    health_days.sleep_duration_seconds,
    health_days.sleep_start_time,
    health_days.sleep_end_time,
    health_days.has_hrv_payload,
    health_days.has_rhr_payload,
    health_days.has_sleep_payload,
    health_days.has_heart_rates_payload
from {{ ref('runs') }} as runs
left join {{ ref('health_days') }} as health_days
    on runs.activity_date = health_days.calendar_date
