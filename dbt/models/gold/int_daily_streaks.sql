{{ config(materialized='table') }}

with ordered_days as (
    select
        calendar_date,
        active_day_flag
    from {{ ref('mart_days') }}
    where is_completed_day
),

streak_groups as (
    select
        calendar_date,
        active_day_flag,
        active_day_flag
            and (lag(active_day_flag) over (order by calendar_date) is not true
                or lag(active_day_flag) over (order by calendar_date) is null)
            as is_streak_start,
        not active_day_flag
            and lag(active_day_flag) over (order by calendar_date) is true
            as is_break_start
    from ordered_days
),

numbered_groups as (
    select
        calendar_date,
        active_day_flag,
        sum(case when is_streak_start or is_break_start then 1 else 0 end)
            over (order by calendar_date) as region_group
    from streak_groups
),

region_lengths as (
    select
        region_group,
        max(active_day_flag) as is_run_region,
        count(*) as region_length
    from numbered_groups
    group by region_group
)

select
    max(case when is_run_region then region_length else 0 end) as longest_daily_run_streak,
    avg(case when is_run_region then region_length * 1.0 end) as average_daily_run_streak,
    max(case when not is_run_region then region_length else 0 end) as longest_training_break,
    avg(case when not is_run_region then region_length * 1.0 end) as average_break_length
from region_lengths
