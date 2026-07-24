{{ config(materialized='table') }}

with health_days as (
    select *
    from {{ ref('health_days') }}
)

select
    calendar_date,
    resting_heart_rate,
    hrv_value,
    hrv_status,
    sleep_score,
    sleep_duration_seconds,
    sleep_start_time,
    sleep_end_time,
    has_hrv_payload,
    has_rhr_payload,
    has_sleep_payload,
    has_heart_rates_payload,
    latest_health_ingested_at,
    latest_health_source_file_modification_time,
    avg(resting_heart_rate) over (
        order by cast(calendar_date as timestamp)
        range between interval 6 days preceding and current row
    ) as rolling_7d_resting_heart_rate,
    avg(resting_heart_rate) over (
        order by cast(calendar_date as timestamp)
        range between interval 29 days preceding and current row
    ) as rolling_30d_resting_heart_rate
from health_days
