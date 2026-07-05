{{ config(materialized='table') }}

select
    week_start_date,
    weekly_distance_km,
    rolling_4w_distance_km,
    rolling_12w_distance_km,
    long_run_distance_km,
    long_run_share_of_week
from {{ ref('mart_weeks') }}
