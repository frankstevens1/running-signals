{{ config(materialized='table') }}

with dates as (
    select *
    from {{ ref('dates') }}
),

runs as (
    select *
    from {{ ref('runs') }}
),

daily_runs as (
    select
        activity_date as calendar_date,
        count(*) as run_count,
        sum(distance_km) as distance_km,
        sum(duration_seconds) as duration_seconds,
        max(distance_km) as long_run_distance_km,
        avg(avg_heart_rate) as avg_run_heart_rate,
        case
            when sum(distance_km) > 0
            then sum(duration_seconds) / 60.0 / sum(distance_km)
        end as avg_pace_min_per_km
    from runs
    group by activity_date
),

days as (
    select
        dates.calendar_date,
        dates.is_completed_day,
        dates.day_of_week_number,
        dates.day_of_week_name,
        dates.day_of_month,
        dates.week_of_year,
        dates.week_start_date,
        dates.week_end_date,
        dates.calendar_month,
        dates.month_start_date,
        dates.month_end_date,
        dates.calendar_quarter,
        dates.calendar_year,
        dates.year_start_date,
        dates.year_end_date,
        dates.is_weekend,
        coalesce(daily_runs.run_count, 0) as run_count,
        coalesce(daily_runs.distance_km, 0.0) as distance_km,
        coalesce(daily_runs.duration_seconds, 0.0) as duration_seconds,
        coalesce(daily_runs.long_run_distance_km, 0.0) as long_run_distance_km,
        daily_runs.avg_run_heart_rate,
        daily_runs.avg_pace_min_per_km,
        coalesce(daily_runs.run_count, 0) > 0 as active_day_flag,
        coalesce(daily_runs.run_count, 0) = 0 as missed_day_flag
    from dates
    left join daily_runs
        on dates.calendar_date = daily_runs.calendar_date
)

select
    *,
    sum(run_count) over (
        order by calendar_date
        rows between 6 preceding and current row
    ) as rolling_7d_run_count,
    sum(distance_km) over (
        order by calendar_date
        rows between 6 preceding and current row
    ) as rolling_7d_distance_km,
    sum(duration_seconds) over (
        order by calendar_date
        rows between 6 preceding and current row
    ) as rolling_7d_duration_seconds,
    sum(run_count) over (
        order by calendar_date
        rows between 27 preceding and current row
    ) as rolling_28d_run_count,
    sum(distance_km) over (
        order by calendar_date
        rows between 27 preceding and current row
    ) as rolling_28d_distance_km,
    sum(duration_seconds) over (
        order by calendar_date
        rows between 27 preceding and current row
    ) as rolling_28d_duration_seconds
from days
