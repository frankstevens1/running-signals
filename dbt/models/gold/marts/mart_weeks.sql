{{ config(materialized='table') }}

with consistency as (
    select *
    from {{ ref('signal_consistency') }}
),

volume as (
    select *
    from {{ ref('signal_volume') }}
)

select
    coalesce(consistency.week_start_date, volume.week_start_date) as week_start_date,
    consistency.runs_per_week,
    consistency.active_week_flag,
    consistency.rolling_4w_run_count,
    consistency.missed_week_flag,
    volume.weekly_distance_km,
    volume.rolling_4w_distance_km,
    volume.long_run_distance_km,
    volume.long_run_share_of_week
from consistency
full outer join volume
    on consistency.week_start_date = volume.week_start_date
