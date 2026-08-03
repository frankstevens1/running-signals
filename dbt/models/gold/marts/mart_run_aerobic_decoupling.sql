{{ config(materialized='table') }}

{% set moving_speed_threshold_mps = var('aerobic_decoupling_moving_speed_threshold_mps', 0.5) %}
{% set minimum_moving_duration_seconds = var('aerobic_decoupling_minimum_moving_duration_seconds', 1200) %}
{% set minimum_moving_distance_m = var('aerobic_decoupling_minimum_moving_distance_m', 5000) %}
{% set minimum_valid_segments = var('aerobic_decoupling_minimum_valid_segments', 8) %}
{% set minimum_hr_coverage_ratio = var('aerobic_decoupling_minimum_hr_coverage_ratio', 0.8) %}
{% set maximum_hr_gap_seconds = var('aerobic_decoupling_maximum_hr_gap_seconds', 30) %}

with records as (
    select
        run_id,
        activity_id,
        activity_date,
        record_index,
        seconds_since_previous_record,
        distance_delta_m,
        speed_mps,
        heart_rate,
        lag(heart_rate) over (
            partition by run_id
            order by record_index
        ) as previous_heart_rate
    from {{ ref('mart_activity_records') }}
),

moving_intervals as (
    select
        *,
        case
            when seconds_since_previous_record > 0
                and distance_delta_m > 0
                and coalesce(speed_mps, distance_delta_m / seconds_since_previous_record) >= {{ moving_speed_threshold_mps }}
            then distance_delta_m
            else 0.0
        end as moving_distance_m,
        case
            when seconds_since_previous_record > 0
                and distance_delta_m > 0
                and coalesce(speed_mps, distance_delta_m / seconds_since_previous_record) >= {{ moving_speed_threshold_mps }}
            then seconds_since_previous_record
            else 0.0
        end as moving_duration_seconds,
        case
            when heart_rate > 0 and previous_heart_rate > 0
            then (heart_rate + previous_heart_rate) / 2.0
        end as interval_heart_rate
    from records
),

ordered_intervals as (
    select
        *,
        sum(moving_distance_m) over (
            partition by run_id
            order by record_index
            rows between unbounded preceding and current row
        ) - moving_distance_m as moving_distance_start_m,
        sum(moving_distance_m) over (
            partition by run_id
            order by record_index
            rows between unbounded preceding and current row
        ) as moving_distance_end_m,
        sum(moving_distance_m) over (
            partition by run_id
        ) as total_moving_distance_m,
        sum(moving_duration_seconds) over (
            partition by run_id
        ) as total_moving_duration_seconds
    from moving_intervals
),

allocated_halves as (
    select
        *,
        total_moving_distance_m / 2.0 as midpoint_distance_m,
        greatest(
            least(total_moving_distance_m / 2.0, moving_distance_end_m) - moving_distance_start_m,
            0.0
        ) as first_half_distance_m,
        greatest(
            moving_distance_end_m - greatest(total_moving_distance_m / 2.0, moving_distance_start_m),
            0.0
        ) as second_half_distance_m
    from ordered_intervals
),

half_interval_metrics as (
    select
        *,
        case
            when moving_distance_m > 0
            then moving_duration_seconds * first_half_distance_m / moving_distance_m
            else 0.0
        end as first_half_duration_seconds,
        case
            when moving_distance_m > 0
            then moving_duration_seconds * second_half_distance_m / moving_distance_m
            else 0.0
        end as second_half_duration_seconds,
        case
            when moving_duration_seconds > 0 and interval_heart_rate is not null then 1
            else 0
        end as has_interval_heart_rate
    from allocated_halves
),

missing_hr_groups as (
    select
        *,
        sum(has_interval_heart_rate) over (
            partition by run_id
            order by record_index
            rows between unbounded preceding and current row
        ) as preceding_valid_hr_group
    from half_interval_metrics
),

maximum_hr_gaps as (
    select
        run_id,
        max(missing_duration_seconds) as maximum_hr_gap_seconds
    from (
        select
            run_id,
            preceding_valid_hr_group,
            sum(moving_duration_seconds) as missing_duration_seconds
        from missing_hr_groups
        where moving_duration_seconds > 0
            and has_interval_heart_rate = 0
        group by
            run_id,
            preceding_valid_hr_group
    )
    group by run_id
),

half_rollups as (
    select
        run_id,
        min(activity_id) as activity_id,
        min(activity_date) as activity_date,
        max(total_moving_distance_m) as moving_distance_m,
        max(total_moving_duration_seconds) as moving_duration_seconds,
        sum(first_half_distance_m) as first_half_distance_m,
        sum(second_half_distance_m) as second_half_distance_m,
        sum(first_half_duration_seconds) as first_half_moving_duration_seconds,
        sum(second_half_duration_seconds) as second_half_moving_duration_seconds,
        sum(case
            when has_interval_heart_rate = 1 then first_half_distance_m
            else 0.0
        end) as first_half_valid_distance_m,
        sum(case
            when has_interval_heart_rate = 1 then second_half_distance_m
            else 0.0
        end) as second_half_valid_distance_m,
        sum(case
            when has_interval_heart_rate = 1 then first_half_duration_seconds
            else 0.0
        end) / nullif(sum(first_half_duration_seconds), 0.0) as first_half_hr_coverage_ratio,
        sum(case
            when has_interval_heart_rate = 1 then second_half_duration_seconds
            else 0.0
        end) / nullif(sum(second_half_duration_seconds), 0.0) as second_half_hr_coverage_ratio,
        sum(case
            when has_interval_heart_rate = 1 then interval_heart_rate * first_half_duration_seconds
            else 0.0
        end) / nullif(sum(case
            when has_interval_heart_rate = 1 then first_half_duration_seconds
            else 0.0
        end), 0.0) as first_half_avg_heart_rate,
        sum(case
            when has_interval_heart_rate = 1 then interval_heart_rate * second_half_duration_seconds
            else 0.0
        end) / nullif(sum(case
            when has_interval_heart_rate = 1 then second_half_duration_seconds
            else 0.0
        end), 0.0) as second_half_avg_heart_rate
    from half_interval_metrics
    group by run_id
),

valid_segments as (
    select
        run_id,
        count(*) as valid_segment_count
    from {{ ref('mart_run_segments') }}
    where unit_system = 'metric'
        and segment_length_m = 250.000
        and segment_distance_m >= 249.5
        and segment_duration_seconds > 0
        and avg_speed_kmh >= {{ moving_speed_threshold_mps }} * 3.6
        and avg_heart_rate > 0
    group by run_id
),

quality as (
    select
        halves.*,
        coalesce(segments.valid_segment_count, 0) as valid_segment_count,
        coalesce(gaps.maximum_hr_gap_seconds, 0.0) as maximum_hr_gap_seconds,
        (first_half_valid_distance_m / nullif(
            first_half_moving_duration_seconds * first_half_hr_coverage_ratio,
            0.0
        )) * 3.6
            as first_half_speed_kmh,
        (second_half_valid_distance_m / nullif(
            second_half_moving_duration_seconds * second_half_hr_coverage_ratio,
            0.0
        )) * 3.6
            as second_half_speed_kmh,
        (
            first_half_moving_duration_seconds * first_half_hr_coverage_ratio
            + second_half_moving_duration_seconds * second_half_hr_coverage_ratio
        ) / nullif(moving_duration_seconds, 0.0) as hr_coverage_ratio
    from half_rollups as halves
    left join valid_segments as segments
        on halves.run_id = segments.run_id
    left join maximum_hr_gaps as gaps
        on halves.run_id = gaps.run_id
),

scored as (
    select
        *,
        first_half_speed_kmh / nullif(first_half_avg_heart_rate, 0.0) as first_half_efficiency_ratio,
        second_half_speed_kmh / nullif(second_half_avg_heart_rate, 0.0) as second_half_efficiency_ratio,
        case
            when moving_duration_seconds < {{ minimum_moving_duration_seconds }} then 'insufficient_moving_duration'
            when moving_distance_m < {{ minimum_moving_distance_m }} then 'insufficient_moving_distance'
            when valid_segment_count < {{ minimum_valid_segments }} then 'insufficient_valid_segments'
            when hr_coverage_ratio < {{ minimum_hr_coverage_ratio }}
                or first_half_hr_coverage_ratio < {{ minimum_hr_coverage_ratio }}
                or second_half_hr_coverage_ratio < {{ minimum_hr_coverage_ratio }}
                then 'insufficient_hr_coverage'
            when maximum_hr_gap_seconds > {{ maximum_hr_gap_seconds }} then 'excessive_hr_gap'
            when first_half_avg_heart_rate is null or second_half_avg_heart_rate is null
                then 'missing_half_heart_rate'
            when first_half_speed_kmh <= 0 or second_half_speed_kmh <= 0
                then 'invalid_half_speed'
        end as aerobic_decoupling_unavailable_reason
    from quality
)

select
    runs.run_id,
    runs.activity_id,
    runs.activity_date,
    scored.moving_distance_m,
    scored.moving_duration_seconds,
    coalesce(scored.valid_segment_count, 0) as valid_segment_count,
    scored.hr_coverage_ratio,
    scored.maximum_hr_gap_seconds,
    scored.first_half_distance_m,
    scored.second_half_distance_m,
    scored.first_half_moving_duration_seconds,
    scored.second_half_moving_duration_seconds,
    scored.first_half_hr_coverage_ratio,
    scored.second_half_hr_coverage_ratio,
    scored.first_half_speed_kmh,
    scored.second_half_speed_kmh,
    scored.first_half_avg_heart_rate,
    scored.second_half_avg_heart_rate,
    scored.first_half_efficiency_ratio,
    scored.second_half_efficiency_ratio,
    case
        when scored.aerobic_decoupling_unavailable_reason is null
        then scored.first_half_efficiency_ratio / nullif(scored.second_half_efficiency_ratio, 0.0) - 1
    end as aerobic_decoupling_pct,
    case
        when scored.aerobic_decoupling_unavailable_reason is null then 'eligible'
        else 'ineligible'
    end as aerobic_decoupling_status,
    case
        when scored.run_id is null then 'missing_moving_telemetry'
        else scored.aerobic_decoupling_unavailable_reason
    end as aerobic_decoupling_unavailable_reason
from {{ ref('runs') }} as runs
left join scored
    on runs.run_id = scored.run_id
