{{ config(materialized='view') }}

with current_week_boundaries as (
    select
        date_trunc('week', {{ analytics_current_date() }}) as week_start_date,
        date_trunc('week', {{ analytics_current_date() }}) + interval 6 days as week_end_date
),

current_week_days as (
    select
        days.*
    from {{ ref('mart_days') }} as days
    cross join current_week_boundaries as boundaries
    where days.calendar_date >= boundaries.week_start_date
      and days.calendar_date <= boundaries.week_end_date
      and days.calendar_date <= {{ analytics_current_date() }}
)

select
    cast(date_trunc('week', {{ analytics_current_date() }}) as date) as week_start_date,
    cast(max(calendar_date) as date) as latest_completed_date,
    coalesce(sum(run_count), 0) as run_count,
    coalesce(sum(distance_km), 0) as distance_km,
    coalesce(sum(case when active_day_flag then 1 else 0 end), 0) as active_days,
    datediff(
        {{ analytics_current_date() }},
        cast(date_trunc('week', {{ analytics_current_date() }}) as date)
    ) + 1 as days_so_far
from current_week_days
