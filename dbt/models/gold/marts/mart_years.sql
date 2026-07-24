{{ config(materialized='table') }}

with days as (
    select *
    from {{ ref('mart_days') }}
)

select
    year_start_date,
    year_end_date,
    calendar_year,
    count(*) as completed_day_count,
    sum(run_count) as runs_per_year,
    sum(distance_km) as yearly_distance_km,
    sum(duration_seconds) as yearly_duration_seconds,
    max(long_run_distance_km) as long_run_distance_km,
    sum(case when active_day_flag then 1 else 0 end) as active_days,
    sum(case when missed_day_flag then 1 else 0 end) as missed_days
from days
group by
    year_start_date,
    year_end_date,
    calendar_year
