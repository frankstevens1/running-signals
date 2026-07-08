{{ config(materialized='table') }}

with records as (
    select *
    from {{ ref('silver_run_records') }}
    where record_distance_m is not null
),

segment_records as (
    select
        *,
        cast(floor(record_distance_m / 250.0) as int) + 1 as segment_index
    from records
)

select
    run_id,
    activity_id,
    activity_date,
    segment_index,
    min(record_timestamp) as segment_start_timestamp,
    max(record_timestamp) as segment_end_timestamp,
    min(record_distance_m) as segment_start_distance_m,
    max(record_distance_m) as segment_end_distance_m,
    (max(record_distance_m) - min(record_distance_m)) / 1000.0 as segment_distance_km,
    cast(unix_timestamp(max(record_timestamp)) - unix_timestamp(min(record_timestamp)) as double)
        as segment_duration_seconds,
    case
        when max(record_distance_m) > min(record_distance_m)
        then (
            unix_timestamp(max(record_timestamp)) - unix_timestamp(min(record_timestamp))
        ) / 60.0 / ((max(record_distance_m) - min(record_distance_m)) / 1000.0)
    end as segment_pace_min_per_km,
    avg(speed_kmh) as avg_speed_kmh,
    avg(heart_rate) as avg_heart_rate,
    max(heart_rate) as max_heart_rate,
    avg(running_cadence) as avg_running_cadence,
    min(altitude_m) as min_altitude_m,
    max(altitude_m) as max_altitude_m,
    max_by(altitude_m, record_timestamp) - min_by(altitude_m, record_timestamp)
        as elevation_change_m,
    case
        when max(record_distance_m) > min(record_distance_m)
        then (
            max_by(altitude_m, record_timestamp) - min_by(altitude_m, record_timestamp)
        ) / (max(record_distance_m) - min(record_distance_m))
    end as segment_grade,
    min_by(position_lat_deg, record_timestamp) as segment_start_latitude_deg,
    min_by(position_long_deg, record_timestamp) as segment_start_longitude_deg,
    max_by(position_lat_deg, record_timestamp) as segment_end_latitude_deg,
    max_by(position_long_deg, record_timestamp) as segment_end_longitude_deg,
    min_by(h3_cell_resolution_8, record_distance_m) as start_h3_cell_resolution_8,
    max_by(h3_cell_resolution_8, record_distance_m) as end_h3_cell_resolution_8,
    min_by(h3_cell_resolution_8, record_distance_m) as representative_h3_cell_resolution_8,
    min_by(h3_cell_resolution_9, record_distance_m) as representative_h3_cell_resolution_9,
    count(*) as record_count
from segment_records
group by
    run_id,
    activity_id,
    activity_date,
    segment_index
