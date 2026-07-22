{{ config(materialized='table') }}

with runs as (
    select *
    from {{ ref('runs') }}
),

health_days as (
    select *
    from {{ ref('health_days') }}
),

segments as (
    select *
    from {{ ref('mart_run_segments') }}
    where unit_system = 'metric'
        and segment_length_m = 250.000
        and segment_distance_km > 0
        and avg_speed_kmh > 0
        and avg_heart_rate > 0
),

ranked_segments as (
    select
        *,
        row_number() over (
            partition by run_id
            order by segment_index
        ) as segment_position,
        count(*) over (
            partition by run_id
        ) as segment_count
    from segments
),

segment_halves as (
    select
        run_id,
        activity_id,
        avg(case
            when segment_position <= segment_count / 2.0
            then avg_speed_kmh / avg_heart_rate
        end) as first_half_efficiency,
        avg(case
            when segment_position > segment_count / 2.0
            then avg_speed_kmh / avg_heart_rate
        end) as second_half_efficiency
    from ranked_segments
    group by
        run_id,
        activity_id
),

hr_drift as (
    select
        run_id,
        activity_id,
        case
            when first_half_efficiency > 0 and second_half_efficiency is not null
            then second_half_efficiency / first_half_efficiency - 1
        end as hr_drift_pct
    from segment_halves
),

run_fitness as (
    select
        runs.activity_id,
        runs.activity_date,
        runs.distance_km,
        runs.duration_seconds,
        runs.avg_pace_min_per_km,
        runs.speed_kmh,
        runs.avg_heart_rate,
        case
            when runs.avg_heart_rate is not null and runs.avg_heart_rate > 0
            then runs.speed_kmh / runs.avg_heart_rate
        end as efficiency_ratio,
        case
            when runs.avg_heart_rate between 100 and 109 then '100-109'
            when runs.avg_heart_rate between 110 and 119 then '110-119'
            when runs.avg_heart_rate between 120 and 129 then '120-129'
            when runs.avg_heart_rate between 130 and 139 then '130-139'
            when runs.avg_heart_rate between 140 and 149 then '140-149'
            when runs.avg_heart_rate between 150 and 159 then '150-159'
            when runs.avg_heart_rate between 160 and 169 then '160-169'
            else 'other'
        end as hr_band,
        runs.garmin_recovery_hr,
        health_days.resting_heart_rate,
        health_days.hrv_value,
        health_days.hrv_status,
        health_days.sleep_score,
        health_days.sleep_duration_seconds,
        health_days.sleep_start_time,
        health_days.sleep_end_time,
        health_days.has_hrv_payload,
        health_days.has_rhr_payload,
        health_days.has_sleep_payload,
        health_days.has_heart_rates_payload,
        hr_drift.hr_drift_pct
    from runs
    left join health_days
        on runs.activity_date = health_days.calendar_date
    left join hr_drift
        on runs.run_id = hr_drift.run_id
)

select
    *,
    avg(efficiency_ratio) over (
        order by activity_date, activity_id
        rows between 3 preceding and current row
    ) as rolling_4_run_efficiency_ratio,
    avg(hr_drift_pct) over (
        order by activity_date, activity_id
        rows between 3 preceding and current row
    ) as rolling_4_run_hr_drift_pct
from run_fitness
