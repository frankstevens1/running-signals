{{ config(materialized='table') }}

with runs as (
    select *
    from {{ ref('runs') }}
),

segments as (
    select *
    from {{ ref('mart_run_segments') }}
    where unit_system = 'metric'
        and segment_length_m = 250.000
),

route_clusters as (
    select *
    from {{ ref('mart_route_clusters') }}
),

prior_training_context as (
    select
        runs.run_id,
        sum(case
            when days.calendar_date >= date_add(runs.activity_date, -7)
            then days.run_count
            else 0
        end) as prior_7d_run_count,
        sum(case
            when days.calendar_date >= date_add(runs.activity_date, -7)
            then days.distance_km
            else 0.0
        end) as prior_7d_distance_km,
        sum(days.run_count) as prior_28d_run_count,
        sum(days.distance_km) as prior_28d_distance_km
    from runs
    left join {{ ref('mart_days') }} as days
        on days.calendar_date between date_add(runs.activity_date, -28)
            and date_add(runs.activity_date, -1)
    group by runs.run_id
),

segment_summary as (
    select
        run_id,
        count(*) as segment_count,
        avg(segment_pace_min_per_km) as avg_segment_pace_min_per_km,
        avg(segment_grade) as avg_segment_grade,
        max(max_altitude_m) - min(min_altitude_m) as route_altitude_range_m,
        sum(elevation_change_m) as net_elevation_change_m
    from segments
    group by run_id
)

select
    runs.run_id,
    runs.activity_id,
    runs.activity_date,
    runs.start_time,
    runs.session_timestamp,
    runs.distance_km,
    runs.duration_seconds,
    runs.avg_pace_min_per_km,
    runs.speed_kmh,
    runs.avg_heart_rate,
    runs.max_heart_rate,
    runs.avg_cadence,
    runs.max_cadence,
    runs.total_ascent,
    runs.total_descent,
    runs.garmin_recovery_hr,
    runs.start_position_lat_deg,
    runs.start_position_long_deg,
    runs.end_position_lat_deg,
    runs.end_position_long_deg,
    runs.record_count,
    runs.gps_record_count,
    runs.first_record_timestamp,
    runs.last_record_timestamp,
    runs.start_record_latitude_deg,
    runs.start_record_longitude_deg,
    runs.end_record_latitude_deg,
    runs.end_record_longitude_deg,
    runs.record_distance_km,
    runs.record_distance_coverage_ratio,
    route_clusters.route_id,
    route_clusters.route_representative_run_id,
    route_clusters.route_match_similarity,
    route_clusters.route_distance_bucket_km,
    route_clusters.start_h3_cell_resolution_9,
    route_clusters.end_h3_cell_resolution_9,
    route_clusters.route_h3_signature,
    segment_summary.segment_count,
    segment_summary.avg_segment_pace_min_per_km,
    segment_summary.avg_segment_grade,
    segment_summary.route_altitude_range_m,
    segment_summary.net_elevation_change_m,
    prior_training_context.prior_7d_run_count,
    prior_training_context.prior_7d_distance_km,
    prior_training_context.prior_28d_run_count,
    prior_training_context.prior_28d_distance_km
from runs
left join route_clusters
    on runs.run_id = route_clusters.run_id
left join segment_summary
    on runs.run_id = segment_summary.run_id
left join prior_training_context
    on runs.run_id = prior_training_context.run_id
