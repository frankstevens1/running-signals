{{ config(materialized='table') }}

{% set baseline_duration_seconds = 900 %}
{% set recent_duration_seconds = 600 %}
{% set warmup_exclusion_seconds = 300 %}
{% set minimum_speed_kmh = 1.8 %}
{% set maximum_record_gap_seconds = 10 %}
{% set minimum_efficiency_pct = 80.0 %}
{% set maximum_efficiency_pct = 120.0 %}
{% set baseline_min_samples = 10 %}
{% set recent_min_samples = 10 %}

with record_intervals as (
    select
        run_id,
        record_index,
        elapsed_seconds,
        seconds_since_previous_record,
        record_distance_m / 1000.0 as distance_km,
        speed_kmh,
        heart_rate,
        case
            when distance_delta_m > 0
            then altitude_delta_m / distance_delta_m
        end as grade
    from {{ ref('run_records') }}
    where seconds_since_previous_record is not null
        and seconds_since_previous_record > 0
),

smoothed_speed as (
    select
        *,
        avg(speed_kmh) over (
            partition by run_id
            order by elapsed_seconds
            rows between 2 preceding and 2 following
        ) as smoothed_speed_kmh
    from record_intervals
),

flagged_intervals as (
    select
        *,
        case
            when smoothed_speed_kmh > 0 and heart_rate > 0
            then smoothed_speed_kmh / heart_rate
        end as smoothed_efficiency,
        case
            when smoothed_speed_kmh < {{ minimum_speed_kmh }} then true
            when seconds_since_previous_record > {{ maximum_record_gap_seconds }} then true
            when elapsed_seconds < {{ warmup_exclusion_seconds }} then true
            when heart_rate <= 0 then true
            when smoothed_speed_kmh <= 0 then true
            else false
        end as excluded
    from smoothed_speed
),

windowed_efficiency as (
    select
        *,
        avg(case when not excluded then smoothed_efficiency end) over (
            partition by run_id
            order by elapsed_seconds
            range between {{ baseline_duration_seconds }} preceding and {{ recent_duration_seconds }} preceding
        ) as baseline_efficiency,
        avg(case when not excluded then smoothed_efficiency end) over (
            partition by run_id
            order by elapsed_seconds
            range between {{ recent_duration_seconds }} preceding and current row
        ) as recent_efficiency,
        count(case when not excluded then 1 end) over (
            partition by run_id
            order by elapsed_seconds
            range between {{ baseline_duration_seconds }} preceding and {{ recent_duration_seconds }} preceding
        ) as baseline_sample_count,
        count(case when not excluded then 1 end) over (
            partition by run_id
            order by elapsed_seconds
            range between {{ recent_duration_seconds }} preceding and current row
        ) as recent_sample_count
    from flagged_intervals
),

trace_points as (
    select
        run_id,
        distance_km,
        case
            when excluded then null
            when baseline_efficiency > 0 and recent_efficiency > 0
            then greatest(
                {{ minimum_efficiency_pct }},
                least({{ maximum_efficiency_pct }}, 100.0 * recent_efficiency / baseline_efficiency)
            )
        end as normalized_efficiency,
        case
            when excluded then 0.0
            when least(baseline_sample_count, recent_sample_count) >= {{ baseline_min_samples }} then 1.0
            when least(baseline_sample_count, recent_sample_count) >= 5 then 0.5
            else 0.2
        end as confidence,
        excluded
    from windowed_efficiency
),

json_trace as (
    select
        run_id,
        to_json(
            collect_list(
                named_struct(
                    'cumulativeDistanceKm', cast(round(distance_km, 3) as double),
                    'normalizedEfficiency',
                        case
                            when normalized_efficiency is not null
                            then cast(round(normalized_efficiency, 1) as double)
                        end,
                    'confidence', cast(round(confidence, 2) as double),
                    'excluded', excluded
                )
            )
        ) as live_drift_trace
    from trace_points
    group by run_id
),

run_minimums as (
    select
        run_id,
        count(*) as total_records,
        sum(case when not excluded then 1 else 0 end) as valid_samples,
        max(elapsed_seconds) as total_elapsed_seconds
    from flagged_intervals
    group by run_id
)

select
    runs.run_id,
    runs.activity_id,
    runs.activity_date,
    coalesce(json_trace.live_drift_trace, '[]') as live_drift_trace,
    coalesce(run_minimums.valid_samples, 0) as drift_valid_samples,
    coalesce(run_minimums.total_elapsed_seconds, 0) as drift_total_elapsed_seconds,
    case
        when runs.run_id is null then null
        when run_minimums.total_elapsed_seconds < {{ warmup_exclusion_seconds }} + {{ recent_duration_seconds }}
            then 'insufficient_duration'
        when run_minimums.valid_samples < {{ baseline_min_samples }}
            then 'insufficient_valid_samples'
    end as drift_unavailable_reason
from {{ ref('runs') }} as runs
left join json_trace
    on runs.run_id = json_trace.run_id
left join run_minimums
    on runs.run_id = run_minimums.run_id
