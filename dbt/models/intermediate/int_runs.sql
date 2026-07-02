{{ config(materialized='view') }}

with sessions as (
    select *
    from {{ source('garmin_raw', 'garmin_fit_sessions') }}
)

select
    run_id,
    garmin_activity_id as activity_id,
    cast(run_date as date) as activity_date,
    start_time,
    timestamp as session_timestamp,
    total_distance / 1000.0 as distance_km,
    total_timer_time as duration_seconds,
    case
        when total_distance > 0 and total_timer_time is not null
        then total_timer_time / 60.0 / (total_distance / 1000.0)
    end as avg_pace_min_per_km,
    case
        when enhanced_avg_speed is not null
        then enhanced_avg_speed * 3.6
        when total_timer_time > 0
        then (total_distance / 1000.0) / (total_timer_time / 3600.0)
    end as speed_kmh,
    avg_heart_rate,
    max_heart_rate,
    enhanced_avg_speed,
    enhanced_max_speed,
    cast(null as double) as garmin_recovery_hr,
    cast(null as double) as resting_hr_7d_avg,
    cast(null as double) as resting_hr_30d_avg,
    source_file_name,
    source_file_path,
    source_file_size_bytes,
    source_file_modification_time,
    ingested_at
from sessions
