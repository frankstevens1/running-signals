{{ config(materialized='table') }}

with days as (
    select *
    from {{ ref('mart_days') }}
    where week_start_date <= date_add(
        cast(date_trunc('week', {{ analytics_current_date() }}) as date),
        -7
    )
),

week_bounds as (
    select min(week_start_date) as first_week_start_date
    from days
),

weekly_all as (
    select
        week_start_date,
        week_end_date,
        true as is_completed_week,
        sum(run_count) as runs_per_week,
        sum(distance_km) as weekly_distance_km,
        sum(duration_seconds) as weekly_duration_seconds,
        max(long_run_distance_km) as long_run_distance_km,
        sum(case when active_day_flag then 1 else 0 end) as active_days,
        sum(case when missed_day_flag then 1 else 0 end) as missed_days,
        sum(run_count) > 0 as active_week_flag,
        sum(run_count) = 0 as missed_week_flag,
        count(*) as completed_day_count
    from days
    group by week_start_date, week_end_date
),

weekly as (
    select weekly_all.*
    from weekly_all
    cross join week_bounds
    where completed_day_count = 7
       or week_start_date = first_week_start_date
),

streak_groups as (
    select
        *,
        sum(case when missed_week_flag then 1 else 0 end) over (
            order by week_start_date
            rows between unbounded preceding and current row
        ) as missed_week_group
    from weekly
),

weekly_with_windows as (
    select
        *,
        sum(runs_per_week) over (
            order by week_start_date
            rows between 3 preceding and current row
        ) as rolling_4w_run_count,
        case
            when active_week_flag
            then sum(case when active_week_flag then 1 else 0 end) over (
                partition by missed_week_group
                order by week_start_date
                rows between unbounded preceding and current row
            )
            else 0
        end as active_week_streak,
        sum(case when missed_week_flag then 1 else 0 end) over (
            order by week_start_date
            rows between 11 preceding and current row
        ) as missed_weeks_12w,
        sum(weekly_distance_km) over (
            order by week_start_date
            rows between 3 preceding and current row
        ) as rolling_4w_distance_km,
        sum(weekly_distance_km) over (
            order by week_start_date
            rows between 11 preceding and current row
        ) as rolling_12w_distance_km
    from streak_groups
)

select
    week_start_date,
    week_end_date,
    is_completed_week,
    runs_per_week,
    weekly_distance_km,
    weekly_duration_seconds,
    case
        when weekly_distance_km > 0
        then weekly_duration_seconds / 60.0 / weekly_distance_km
    end as avg_pace_min_per_km,
    long_run_distance_km,
    case
        when runs_per_week > 0
        then weekly_distance_km / runs_per_week
    end as avg_run_distance_km,
    case
        when weekly_distance_km > 0
        then long_run_distance_km / weekly_distance_km
    end as long_run_share_of_week,
    active_days,
    missed_days,
    active_week_flag,
    missed_week_flag,
    completed_day_count,
    rolling_4w_run_count,
    active_week_streak,
    missed_weeks_12w,
    rolling_4w_distance_km,
    rolling_12w_distance_km
from weekly_with_windows
