{{ config(materialized='view') }}

with dates as (
    select *
    from {{ ref('silver_dates') }}
),

run_bounds as (
    select
        cast(date_trunc('week', min(calendar_date)) as date) as first_week_start_date,
        date_add(cast(date_trunc('week', current_date()) as date), -7) as latest_completed_week_start_date
    from dates
),

week_spine as (
    select
        explode(sequence(
            first_week_start_date,
            latest_completed_week_start_date,
            interval 7 days
        )) as week_start_date
    from run_bounds
    where first_week_start_date is not null
        and first_week_start_date <= latest_completed_week_start_date
),

weekly_runs as (
    select
        cast(date_trunc('week', activity_date) as date) as week_start_date,
        count(*) as runs_per_week,
        sum(distance_km) as weekly_distance_km,
        sum(duration_seconds) as weekly_duration_seconds,
        max(distance_km) as long_run_distance_km
    from {{ ref('silver_runs') }}
    group by 1
)

select
    cast(week_spine.week_start_date as date) as week_start_date,
    date_add(cast(week_spine.week_start_date as date), 6) as week_end_date,
    true as is_completed_week,
    coalesce(weekly_runs.runs_per_week, 0) as runs_per_week,
    coalesce(weekly_runs.weekly_distance_km, 0.0) as weekly_distance_km,
    coalesce(weekly_runs.weekly_duration_seconds, 0.0) as weekly_duration_seconds,
    coalesce(weekly_runs.long_run_distance_km, 0.0) as long_run_distance_km,
    coalesce(weekly_runs.runs_per_week, 0) > 0 as active_week_flag,
    coalesce(weekly_runs.runs_per_week, 0) = 0 as missed_week_flag
from week_spine
left join weekly_runs
    on week_spine.week_start_date = weekly_runs.week_start_date
