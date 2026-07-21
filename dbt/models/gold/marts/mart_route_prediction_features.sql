{{ config(materialized='table') }}

with sessions as (
    select *
    from {{ ref('mart_run_sessions') }}
    where route_id is not null
),

routes as (
    select *
    from {{ ref('mart_routes') }}
),

session_features as (
    select
        sessions.*,
        count(*) over (
            partition by sessions.route_id
            order by sessions.activity_date, sessions.activity_id
            rows between unbounded preceding and 1 preceding
        ) as prior_route_run_count,
        avg(sessions.avg_pace_min_per_km) over (
            partition by sessions.route_id
            order by sessions.activity_date, sessions.activity_id
            rows between unbounded preceding and 1 preceding
        ) as prior_route_avg_pace_min_per_km,
        avg(sessions.avg_heart_rate) over (
            partition by sessions.route_id
            order by sessions.activity_date, sessions.activity_id
            rows between unbounded preceding and 1 preceding
        ) as prior_route_avg_heart_rate,
        avg(sessions.duration_seconds) over (
            partition by sessions.route_id
            order by sessions.activity_date, sessions.activity_id
            rows between unbounded preceding and 1 preceding
        ) as prior_route_avg_duration_seconds
    from sessions
)

select
    session_features.run_id,
    session_features.activity_id,
    session_features.activity_date,
    session_features.route_id,
    session_features.route_distance_bucket_km,
    session_features.segment_count,
    session_features.avg_segment_grade,
    session_features.route_altitude_range_m,
    session_features.total_ascent,
    session_features.total_descent,
    session_features.prior_7d_run_count,
    session_features.prior_7d_distance_km,
    session_features.prior_28d_run_count,
    session_features.prior_28d_distance_km,
    session_features.prior_28d_avg_resting_heart_rate,
    session_features.resting_heart_rate,
    session_features.hrv_value,
    session_features.sleep_score,
    session_features.prior_route_run_count,
    session_features.prior_route_avg_pace_min_per_km,
    session_features.prior_route_avg_heart_rate,
    session_features.prior_route_avg_duration_seconds,
    routes.run_count as route_lifetime_run_count,
    routes.avg_distance_km as route_lifetime_avg_distance_km,
    routes.avg_pace_min_per_km as route_lifetime_avg_pace_min_per_km,
    routes.avg_heart_rate as route_lifetime_avg_heart_rate,
    session_features.distance_km as label_completion_distance_km,
    session_features.duration_seconds as label_duration_seconds,
    session_features.avg_pace_min_per_km as label_avg_pace_min_per_km,
    session_features.avg_heart_rate as label_avg_heart_rate
from session_features
left join routes
    on session_features.route_id = routes.route_id
