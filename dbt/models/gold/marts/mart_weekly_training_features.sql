{{ config(materialized='table') }}

with weeks as (
    select *
    from {{ ref('mart_weeks') }}
)

select
    *,
    lag(runs_per_week) over (
        order by week_start_date
    ) as prior_week_runs_per_week,
    lag(weekly_distance_km) over (
        order by week_start_date
    ) as prior_week_distance_km,
    lag(weekly_duration_seconds) over (
        order by week_start_date
    ) as prior_week_duration_seconds,
    lag(active_week_flag) over (
        order by week_start_date
    ) as prior_week_active_week_flag,
    lag(avg_resting_heart_rate) over (
        order by week_start_date
    ) as prior_week_avg_resting_heart_rate,
    lead(runs_per_week) over (
        order by week_start_date
    ) as next_week_runs_per_week,
    lead(weekly_distance_km) over (
        order by week_start_date
    ) as next_week_distance_km,
    lead(weekly_duration_seconds) over (
        order by week_start_date
    ) as next_week_duration_seconds,
    lead(active_week_flag) over (
        order by week_start_date
    ) as next_week_active_week_flag
from weeks
