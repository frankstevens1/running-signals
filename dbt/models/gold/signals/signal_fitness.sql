{{ config(materialized='table') }}

select
    activity_id,
    activity_date,
    distance_km,
    duration_seconds,
    avg_pace_min_per_km,
    avg_heart_rate,
    case
        when avg_heart_rate is not null and avg_heart_rate > 0
        then speed_kmh / avg_heart_rate
    end as efficiency_ratio,
    case
        when avg_heart_rate between 100 and 109 then '100-109'
        when avg_heart_rate between 110 and 119 then '110-119'
        when avg_heart_rate between 120 and 129 then '120-129'
        when avg_heart_rate between 130 and 139 then '130-139'
        when avg_heart_rate between 140 and 149 then '140-149'
        when avg_heart_rate between 150 and 159 then '150-159'
        when avg_heart_rate between 160 and 169 then '160-169'
        else 'other'
    end as hr_band,
    garmin_recovery_hr,
    resting_hr_7d_avg,
    resting_hr_30d_avg
from {{ ref('int_runs') }}