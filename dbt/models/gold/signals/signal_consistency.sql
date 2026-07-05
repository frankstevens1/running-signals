{{ config(materialized='table') }}

select
    week_start_date,
    runs_per_week,
    active_week_flag,
    missed_week_flag,
    rolling_4w_run_count,
    active_week_streak,
    missed_weeks_12w
from {{ ref('mart_weeks') }}
