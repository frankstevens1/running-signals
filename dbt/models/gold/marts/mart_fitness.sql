{{ config(materialized='table') }}

with runs as (
    select *
    from {{ ref('runs') }}
),

aerobic_decoupling as (
    select *
    from {{ ref('mart_run_aerobic_decoupling') }}
),

efficiency_trace as (
    select
        activity_id,
        live_drift_trace,
        drift_valid_samples,
        drift_total_elapsed_seconds
    from {{ ref('mart_run_efficiency_trace') }}
),

prior_7d_load as (
    select
        runs.run_id,
        sum(case
            when days.calendar_date >= date_add(runs.activity_date, -7)
            then days.distance_km
            else 0.0
        end) as prior_7d_distance_km
    from runs
    left join {{ ref('mart_days') }} as days
        on days.calendar_date between date_add(runs.activity_date, -7)
            and date_add(runs.activity_date, -1)
    group by runs.run_id
),

record_economy as (
    select
        run_id,
        sum(heart_rate * seconds_since_previous_record / 60.0) as total_heartbeats,
        max(record_distance_m) as total_distance_m,
        sum(case when altitude_delta_m > 0 then altitude_delta_m else 0 end) as elevation_gain_m
    from {{ ref('mart_activity_records') }}
    where heart_rate is not null
      and seconds_since_previous_record is not null
      and seconds_since_previous_record > 0
    group by run_id
),

economy_metrics as (
    select
        run_id,
        case
            when total_heartbeats > 0
            then total_distance_m / total_heartbeats
        end as distance_economy_m_per_beat,
        case
            when total_heartbeats > 0
            then elevation_gain_m / total_heartbeats
        end as elevation_economy_m_per_beat
    from record_economy
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
        runs.ending_heart_rate,
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
        prior_7d_load.prior_7d_distance_km,
        aerobic_decoupling.aerobic_decoupling_pct,
        aerobic_decoupling.aerobic_decoupling_status,
        aerobic_decoupling.aerobic_decoupling_unavailable_reason,
        aerobic_decoupling.aerobic_decoupling_failed_gates,
        aerobic_decoupling.timer_running_duration_seconds
            as aerobic_decoupling_moving_duration_seconds,
        aerobic_decoupling.valid_segment_count as aerobic_decoupling_valid_segment_count,
        aerobic_decoupling.hr_coverage_ratio as aerobic_decoupling_hr_coverage_ratio,
        aerobic_decoupling.maximum_hr_gap_seconds as aerobic_decoupling_maximum_hr_gap_seconds,
        aerobic_decoupling.first_half_speed_kmh,
        aerobic_decoupling.second_half_speed_kmh,
        aerobic_decoupling.first_half_avg_heart_rate,
        aerobic_decoupling.second_half_avg_heart_rate,
        aerobic_decoupling.first_half_efficiency_ratio,
        aerobic_decoupling.second_half_efficiency_ratio,
        economy.distance_economy_m_per_beat,
        economy.elevation_economy_m_per_beat,
        efficiency_trace.live_drift_trace,
        efficiency_trace.drift_valid_samples,
        efficiency_trace.drift_total_elapsed_seconds
    from runs
    left join aerobic_decoupling
        on runs.run_id = aerobic_decoupling.run_id
    left join economy_metrics as economy
        on runs.run_id = economy.run_id
    left join prior_7d_load
        on runs.run_id = prior_7d_load.run_id
    left join efficiency_trace
        on runs.activity_id = efficiency_trace.activity_id
),

windowed as (
    select
        *,
    avg(efficiency_ratio) over (
        order by activity_date, activity_id
        rows between 3 preceding and current row
    ) as rolling_4_run_efficiency_ratio,
    avg(garmin_recovery_hr) over (
        order by activity_date, activity_id
        rows between 3 preceding and current row
    ) as rolling_4_run_recovery_hr,
    count(case
        when garmin_recovery_hr > 0 and ending_heart_rate > 0 then garmin_recovery_hr
    end) over recovery_prior_90d_window as recovery_prior_90d_count,
    percentile_approx(
        case when garmin_recovery_hr > 0 and ending_heart_rate > 0 then garmin_recovery_hr end,
        0.5,
        10000
    ) over recovery_prior_90d_window as recovery_prior_90d_median,
    percentile_approx(
        case when garmin_recovery_hr > 0 and ending_heart_rate > 0 then garmin_recovery_hr end,
        0.25,
        10000
    ) over recovery_prior_90d_window as recovery_prior_90d_q1,
    percentile_approx(
        case when garmin_recovery_hr > 0 and ending_heart_rate > 0 then garmin_recovery_hr end,
        0.75,
        10000
    ) over recovery_prior_90d_window as recovery_prior_90d_q3,
    min(case
        when garmin_recovery_hr > 0 and ending_heart_rate > 0 then garmin_recovery_hr
    end) over recovery_prior_90d_window as recovery_prior_90d_min,
    max(case
        when garmin_recovery_hr > 0 and ending_heart_rate > 0 then garmin_recovery_hr
    end) over recovery_prior_90d_window as recovery_prior_90d_max,
    avg(distance_economy_m_per_beat) over (
        order by activity_date
        range between interval '90' day preceding and interval '1' day preceding
    ) as expected_distance_economy_m_per_beat,
    count(distance_economy_m_per_beat) over (
        order by activity_date
        range between interval '90' day preceding and interval '1' day preceding
    ) as expected_economy_sample_size,
    count(aerobic_decoupling_pct) over aerobic_decoupling_prior_90d_window
        as aerobic_decoupling_prior_90d_count,
    percentile_approx(aerobic_decoupling_pct, 0.5, 10000) over aerobic_decoupling_prior_90d_window
        as aerobic_decoupling_prior_90d_median,
    percentile_approx(aerobic_decoupling_pct, 0.25, 10000) over aerobic_decoupling_prior_90d_window
        as aerobic_decoupling_prior_90d_q1,
    percentile_approx(aerobic_decoupling_pct, 0.75, 10000) over aerobic_decoupling_prior_90d_window
        as aerobic_decoupling_prior_90d_q3,
    last(aerobic_decoupling_pct, true) over prior_qualifying_run_window
        as previous_aerobic_decoupling_pct,
    last(distance_economy_m_per_beat, true) over prior_qualifying_run_window
        as previous_distance_economy_m_per_beat,
    last(elevation_economy_m_per_beat, true) over prior_qualifying_run_window
        as previous_elevation_economy_m_per_beat,
    last(prior_7d_distance_km, true) over prior_qualifying_run_window
        as previous_prior_7d_distance_km
    from run_fitness
    window recovery_prior_90d_window as (
        partition by case
            when ending_heart_rate > 0 then floor(ending_heart_rate / 10) * 10
        end
        order by activity_date
        range between interval '90' day preceding and interval '1' day preceding
    ),
    aerobic_decoupling_prior_90d_window as (
        order by activity_date
        range between interval '90' day preceding and interval '1' day preceding
    ),
    prior_qualifying_run_window as (
        order by activity_date, activity_id
        rows between unbounded preceding and 1 preceding
    )
)

select
    * except (
        recovery_prior_90d_median,
        recovery_prior_90d_q1,
        recovery_prior_90d_q3,
        recovery_prior_90d_min,
        recovery_prior_90d_max,
        expected_distance_economy_m_per_beat,
        expected_economy_sample_size,
        aerobic_decoupling_prior_90d_median,
        aerobic_decoupling_prior_90d_q1,
        aerobic_decoupling_prior_90d_q3
    ),
    case when recovery_prior_90d_count >= 4 then recovery_prior_90d_median end
        as recovery_prior_90d_median,
    case when recovery_prior_90d_count >= 4 then recovery_prior_90d_q1 end
        as recovery_prior_90d_q1,
    case when recovery_prior_90d_count >= 4 then recovery_prior_90d_q3 end
        as recovery_prior_90d_q3,
    case when recovery_prior_90d_count >= 4 then recovery_prior_90d_min end
        as recovery_prior_90d_min,
    case when recovery_prior_90d_count >= 4 then recovery_prior_90d_max end
        as recovery_prior_90d_max,
    case when aerobic_decoupling_prior_90d_count >= 4 then aerobic_decoupling_prior_90d_median end
        as aerobic_decoupling_prior_90d_median,
    case when aerobic_decoupling_prior_90d_count >= 4 then aerobic_decoupling_prior_90d_q1 end
        as aerobic_decoupling_prior_90d_q1,
    case when aerobic_decoupling_prior_90d_count >= 4 then aerobic_decoupling_prior_90d_q3 end
        as aerobic_decoupling_prior_90d_q3,
    case
        when expected_economy_sample_size >= 3
            and expected_distance_economy_m_per_beat > 0
            and distance_economy_m_per_beat is not null
        then 100 * distance_economy_m_per_beat / expected_distance_economy_m_per_beat
    end as personal_efficiency_score
from windowed
