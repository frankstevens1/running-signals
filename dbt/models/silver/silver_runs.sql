{{ config(materialized='view') }}

with sessions as (
    select *
    from {{ source('garmin_raw', 'garmin_fit_sessions') }}
),

record_summary as (
    select
        run_id,
        count(*) as record_count,
        count(position_lat_deg) as gps_record_count,
        min(cast(timestamp as timestamp)) as first_record_timestamp,
        max(cast(timestamp as timestamp)) as last_record_timestamp,
        min_by(position_lat_deg, cast(timestamp as timestamp)) as start_record_latitude_deg,
        min_by(position_long_deg, cast(timestamp as timestamp)) as start_record_longitude_deg,
        max_by(position_lat_deg, cast(timestamp as timestamp)) as end_record_latitude_deg,
        max_by(position_long_deg, cast(timestamp as timestamp)) as end_record_longitude_deg,
        max(distance) / 1000.0 as record_distance_km
    from {{ source('garmin_raw', 'garmin_fit_records') }}
    group by run_id
)

select
    sessions.run_id,
    sessions.garmin_activity_id as activity_id,
    cast(sessions.run_date as date) as activity_date,
    sessions.start_time,
    sessions.timestamp as session_timestamp,
    sessions.total_distance / 1000.0 as distance_km,
    sessions.total_timer_time as duration_seconds,
    case
        when sessions.total_distance > 0 and sessions.total_timer_time is not null
        then sessions.total_timer_time / 60.0 / (sessions.total_distance / 1000.0)
    end as avg_pace_min_per_km,
    case
        when sessions.enhanced_avg_speed is not null
        then sessions.enhanced_avg_speed * 3.6
        when sessions.total_timer_time > 0
        then (sessions.total_distance / 1000.0) / (sessions.total_timer_time / 3600.0)
    end as speed_kmh,
    sessions.avg_heart_rate,
    sessions.max_heart_rate,
    sessions.avg_cadence,
    sessions.max_cadence,
    sessions.total_ascent,
    sessions.total_descent,
    sessions.enhanced_avg_speed,
    sessions.enhanced_max_speed,
    cast(null as double) as garmin_recovery_hr,
    cast(null as double) as resting_hr_7d_avg,
    cast(null as double) as resting_hr_30d_avg,
    sessions.start_position_lat_deg,
    sessions.start_position_long_deg,
    sessions.end_position_lat_deg,
    sessions.end_position_long_deg,
    record_summary.record_count,
    record_summary.gps_record_count,
    record_summary.first_record_timestamp,
    record_summary.last_record_timestamp,
    record_summary.start_record_latitude_deg,
    record_summary.start_record_longitude_deg,
    record_summary.end_record_latitude_deg,
    record_summary.end_record_longitude_deg,
    record_summary.record_distance_km,
    case
        when sessions.total_distance > 0 and record_summary.record_distance_km is not null
        then record_summary.record_distance_km / (sessions.total_distance / 1000.0)
    end as record_distance_coverage_ratio,
    sessions.source_file_name,
    sessions.source_file_path,
    sessions.source_file_size_bytes,
    sessions.source_file_modification_time,
    sessions.ingested_at
from sessions
left join record_summary
    on sessions.run_id = record_summary.run_id
