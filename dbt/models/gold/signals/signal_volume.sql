{{ config(materialized='table') }}

with runs as (
    select *
    from {{ ref('int_runs') }}
),

weekly as (
    select
        date_trunc('week', activity_date) as week_start_date,
        sum(distance_km) as weekly_distance_km,
        max(distance_km) as long_run_distance_km
    from runs
    group by 1
)

select
    week_start_date,
    weekly_distance_km,
    sum(weekly_distance_km) over (
        order by week_start_date
        rows between 3 preceding and current row
    ) as rolling_4w_distance_km,
    long_run_distance_km,
    case
        when weekly_distance_km > 0
        then long_run_distance_km / weekly_distance_km
    end as long_run_share_of_week
from weekly
