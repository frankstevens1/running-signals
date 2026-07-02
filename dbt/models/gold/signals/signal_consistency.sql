{{ config(materialized='table') }}

with runs as (
    select *
    from {{ ref('int_runs') }}
),

weekly as (
    select
        date_trunc('week', activity_date) as week_start_date,
        count(*) as runs_per_week,
        case when count(*) > 0 then true else false end as active_week_flag
    from runs
    group by 1
)

select
    week_start_date,
    runs_per_week,
    active_week_flag,
    sum(runs_per_week) over (
        order by week_start_date
        rows between 3 preceding and current row
    ) as rolling_4w_run_count,
    not active_week_flag as missed_week_flag
from weekly
