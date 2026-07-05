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
    sum(case when missed_day_flag then 1 else 0 end) as missed_days,
    avg(resting_heart_rate) as avg_resting_heart_rate,
    avg(hrv_value) as avg_hrv_value,
    avg(sleep_score) as avg_sleep_score,
    avg(sleep_duration_seconds) as avg_sleep_duration_seconds,
    max(case when has_hrv_payload then 1 else 0 end) = 1 as has_hrv_payload_year,
    max(case when has_rhr_payload then 1 else 0 end) = 1 as has_rhr_payload_year,
    max(case when has_sleep_payload then 1 else 0 end) = 1 as has_sleep_payload_year,
    max(case when has_heart_rates_payload then 1 else 0 end) = 1
        as has_heart_rates_payload_year
from days
group by
    year_start_date,
    year_end_date,
    calendar_year
