{{ config(materialized='view') }}

with observed_dates as (
    select activity_date as calendar_date
    from {{ ref('runs') }}

    union all

    select calendar_date
    from {{ ref('health_days') }}
),

date_bounds as (
    select
        min(calendar_date) as first_observed_date,
        date_add(current_date(), -1) as latest_completed_date
    from observed_dates
),

date_spine as (
    select explode(sequence(
        first_observed_date,
        latest_completed_date,
        interval 1 day
    )) as calendar_date
    from date_bounds
    where first_observed_date is not null
        and first_observed_date <= latest_completed_date
)

select
    cast(calendar_date as date) as calendar_date,
    true as is_completed_day,
    dayofweek(calendar_date) as day_of_week_number,
    date_format(calendar_date, 'E') as day_of_week_name,
    dayofmonth(calendar_date) as day_of_month,
    weekofyear(calendar_date) as week_of_year,
    cast(date_trunc('week', calendar_date) as date) as week_start_date,
    date_add(cast(date_trunc('week', calendar_date) as date), 6) as week_end_date,
    month(calendar_date) as calendar_month,
    cast(date_trunc('month', calendar_date) as date) as month_start_date,
    last_day(calendar_date) as month_end_date,
    quarter(calendar_date) as calendar_quarter,
    year(calendar_date) as calendar_year,
    cast(date_trunc('year', calendar_date) as date) as year_start_date,
    date_add(add_months(cast(date_trunc('year', calendar_date) as date), 12), -1) as year_end_date,
    dayofweek(calendar_date) in (1, 7) as is_weekend
from date_spine
