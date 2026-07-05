{{ config(materialized='table') }}

with fitness as (
    select *
    from {{ ref('signal_fitness') }}
),

weeks as (
    select *
    from {{ ref('mart_weeks') }}
)

select
    fitness.*,
    weeks.week_start_date,
    weeks.runs_per_week,
    weeks.active_week_flag,
    weeks.missed_week_flag,
    weeks.rolling_4w_run_count,
    weeks.active_week_streak,
    weeks.missed_weeks_12w,
    weeks.weekly_distance_km,
    weeks.rolling_4w_distance_km,
    weeks.rolling_12w_distance_km,
    weeks.long_run_distance_km,
    weeks.long_run_share_of_week
from fitness
left join weeks
    on date_trunc('week', fitness.activity_date) = weeks.week_start_date
