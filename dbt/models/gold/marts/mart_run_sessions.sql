{{ config(materialized='table') }}

with runs as (
    select *
    from {{ ref('silver_runs') }}
),

segments as (
    select *
    from {{ ref('mart_run_segments') }}
),

route_cells as (
    select
        run_id,
        segment_index,
        representative_h3_cell_resolution_9 as h3_cell_resolution_9
    from segments
    where representative_h3_cell_resolution_9 is not null
),

route_signatures as (
    select
        runs.run_id,
        min_by(route_cells.h3_cell_resolution_9, route_cells.segment_index) as start_h3_cell_resolution_9,
        max_by(route_cells.h3_cell_resolution_9, route_cells.segment_index) as end_h3_cell_resolution_9,
        round(runs.distance_km * 2.0) / 2.0 as route_distance_bucket_km,
        transform(
            array_sort(collect_list(named_struct(
                'segment_index', route_cells.segment_index,
                'h3_cell', cast(route_cells.h3_cell_resolution_9 as string)
            ))),
            cell -> cell.h3_cell
        ) as route_h3_path
    from runs
    inner join route_cells
        on runs.run_id = route_cells.run_id
    group by runs.run_id, runs.distance_km
),

routes as (
    select
        *,
        case
            when size(route_h3_path) > 0
            then sha2(concat_ws(
                '|',
                cast(start_h3_cell_resolution_9 as string),
                cast(end_h3_cell_resolution_9 as string),
                cast(route_distance_bucket_km as string),
                concat_ws('>', route_h3_path)
            ), 256)
        end as route_id,
        case
            when size(route_h3_path) > 0
            then concat_ws('>', route_h3_path)
        end as route_h3_signature
    from route_signatures
),

daily_context as (
    select *
    from {{ ref('mart_days') }}
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
        sum(days.distance_km) as prior_28d_distance_km,
        avg(days.resting_heart_rate) as prior_28d_avg_resting_heart_rate
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
    routes.route_id,
    routes.route_distance_bucket_km,
    routes.start_h3_cell_resolution_9,
    routes.end_h3_cell_resolution_9,
    routes.route_h3_signature,
    segment_summary.segment_count,
    segment_summary.avg_segment_pace_min_per_km,
    segment_summary.avg_segment_grade,
    segment_summary.route_altitude_range_m,
    segment_summary.net_elevation_change_m,
    daily_context.resting_heart_rate,
    daily_context.hrv_value,
    daily_context.hrv_status,
    daily_context.sleep_score,
    daily_context.sleep_duration_seconds,
    daily_context.rolling_7d_resting_heart_rate,
    daily_context.rolling_30d_resting_heart_rate,
    prior_training_context.prior_7d_run_count,
    prior_training_context.prior_7d_distance_km,
    prior_training_context.prior_28d_run_count,
    prior_training_context.prior_28d_distance_km,
    prior_training_context.prior_28d_avg_resting_heart_rate
from runs
left join routes
    on runs.run_id = routes.run_id
left join segment_summary
    on runs.run_id = segment_summary.run_id
left join daily_context
    on runs.activity_date = daily_context.calendar_date
left join prior_training_context
    on runs.run_id = prior_training_context.run_id
