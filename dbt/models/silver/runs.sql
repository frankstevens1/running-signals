{{ config(materialized='view') }}

with sessions as (
    select *
    from {{ source('garmin_raw', 'garmin_fit_sessions') }}
),

fit_records as (
    select *
    from {{ source('garmin_raw', 'garmin_fit_records') }}
),

recovery_events as (
    select
        run_id,
        recovery_heart_rate
    from (
        select
            run_id,
            try_cast(data as double) as recovery_heart_rate,
            row_number() over (
                partition by run_id
                order by
                    cast(timestamp as timestamp) desc,
                    source_file_modification_time desc,
                    ingested_at desc
            ) as recovery_event_rank
        from {{ source('garmin_raw', 'garmin_fit_events') }}
        where event = 'recovery_hr'
    )
    where recovery_event_rank = 1
),

last_record_heart_rates as (
    select
        run_id,
        heart_rate as last_record_heart_rate
    from (
        select
            run_id,
            heart_rate,
            row_number() over (
                partition by run_id
                order by
                    cast(timestamp as timestamp) desc,
                    source_file_modification_time desc,
                    ingested_at desc
            ) as heart_rate_rank
        from fit_records
        where heart_rate is not null
    )
    where heart_rate_rank = 1
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
    from fit_records
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
    sessions.avg_cadence * 2.0 as avg_cadence,
    sessions.max_cadence * 2.0 as max_cadence,
    sessions.total_ascent,
    sessions.total_descent,
    sessions.enhanced_avg_speed,
    sessions.enhanced_max_speed,
    case
        when last_record_heart_rates.last_record_heart_rate is not null
            and recovery_events.recovery_heart_rate is not null
        then last_record_heart_rates.last_record_heart_rate - recovery_events.recovery_heart_rate
    end as garmin_recovery_hr,
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
left join recovery_events
    on sessions.run_id = recovery_events.run_id
left join last_record_heart_rates
    on sessions.run_id = last_record_heart_rates.run_id
left join record_summary
    on sessions.run_id = record_summary.run_id
