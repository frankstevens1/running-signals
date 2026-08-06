{{ config(materialized='table') }}

{% set minimum_timer_running_duration_seconds = var('aerobic_decoupling_minimum_timer_running_duration_seconds', 1200) %}
{% set minimum_timer_running_distance_m = var('aerobic_decoupling_minimum_timer_running_distance_m', 5000) %}
{% set minimum_valid_segments = var('aerobic_decoupling_minimum_valid_segments', 8) %}
{% set minimum_hr_coverage_ratio = var('aerobic_decoupling_minimum_hr_coverage_ratio', 0.8) %}
{% set maximum_hr_gap_seconds = var('aerobic_decoupling_maximum_hr_gap_seconds', 30) %}
{% set minimum_segment_speed_kmh = var('aerobic_decoupling_minimum_segment_speed_kmh', 1.8) %}
{% set timer_reconciliation_tolerance_seconds = var('aerobic_decoupling_timer_reconciliation_tolerance_seconds', 2) %}

with timer_event_source as (
    select
        run_id,
        cast(timestamp as timestamp) as event_timestamp,
        event_type,
        row_number() over (
            partition by run_id, timestamp, event_type
            order by source_file_modification_time desc, ingested_at desc
        ) as event_rank
    from {{ source('garmin_raw', 'garmin_fit_events') }}
    where event = 'timer'
),

timer_state_events as (
    select
        run_id,
        event_timestamp,
        event_type
    from timer_event_source
    where event_rank = 1
        and event_type in ('start', 'stop', 'stop_all', 'stop_disable', 'stop_disable_all')
),

timer_event_sequence as (
    select
        *,
        lead(event_timestamp) over (
            partition by run_id
            order by event_timestamp, event_type
        ) as next_event_timestamp,
        lead(event_type) over (
            partition by run_id
            order by event_timestamp, event_type
        ) as next_event_type
    from timer_state_events
),

timer_windows as (
    select
        run_id,
        event_timestamp as timer_start_timestamp,
        next_event_timestamp as timer_end_timestamp
    from timer_event_sequence
    where event_type = 'start'
        and next_event_type in ('stop', 'stop_all', 'stop_disable', 'stop_disable_all')
        and next_event_timestamp > event_timestamp
),

timer_event_summary as (
    select
        run_id,
        sum(case when event_type = 'start' then 1 else 0 end) as timer_start_count,
        sum(case
            when event_type in ('stop', 'stop_all', 'stop_disable', 'stop_disable_all') then 1
            else 0
        end) as timer_stop_count
    from timer_state_events
    group by run_id
),

timer_window_rollups as (
    select
        run_id,
        count(*) as timer_window_count,
        sum(unix_timestamp(timer_end_timestamp) - unix_timestamp(timer_start_timestamp))
            as timer_event_duration_seconds
    from timer_windows
    group by run_id
),

run_timer_context as (
    select
        runs.run_id,
        runs.duration_seconds as session_timer_duration_seconds,
        coalesce(events.timer_start_count, 0) as timer_start_count,
        coalesce(events.timer_stop_count, 0) as timer_stop_count,
        coalesce(windows.timer_window_count, 0) as timer_window_count,
        windows.timer_event_duration_seconds
    from {{ ref('runs') }} as runs
    left join timer_event_summary as events
        on runs.run_id = events.run_id
    left join timer_window_rollups as windows
        on runs.run_id = windows.run_id
),

records as (
    select
        run_id,
        activity_id,
        activity_date,
        record_index,
        record_timestamp,
        record_distance_m,
        heart_rate,
        lag(heart_rate) over (
            partition by run_id
            order by record_index
        ) as previous_heart_rate
    from {{ ref('mart_activity_records') }}
),

monotonic_records as (
    select
        *,
        coalesce(max(record_distance_m) over (
            partition by run_id
            order by record_index
            rows between unbounded preceding and current row
        ), 0.0) as analysis_distance_m
    from records
),

record_intervals as (
    select
        *,
        coalesce(lag(record_timestamp) over (
            partition by run_id
            order by record_index
        ), record_timestamp) as interval_start_timestamp,
        coalesce(lag(analysis_distance_m) over (
            partition by run_id
            order by record_index
        ), 0.0) as interval_start_distance_m,
        greatest(
            cast(
                unix_timestamp(record_timestamp)
                - unix_timestamp(coalesce(lag(record_timestamp) over (
                    partition by run_id
                    order by record_index
                ), record_timestamp))
                as double
            ),
            0.0
        ) as interval_duration_seconds
    from monotonic_records
),

timer_interval_overlaps as (
    select
        intervals.run_id,
        intervals.record_index,
        sum(greatest(
            cast(least(
                unix_timestamp(intervals.record_timestamp),
                unix_timestamp(windows.timer_end_timestamp)
            ) - greatest(
                unix_timestamp(intervals.interval_start_timestamp),
                unix_timestamp(windows.timer_start_timestamp)
            ) as double),
            0.0
        )) as timer_running_duration_seconds
    from record_intervals as intervals
    inner join timer_windows as windows
        on intervals.run_id = windows.run_id
            and intervals.interval_start_timestamp < windows.timer_end_timestamp
            and intervals.record_timestamp > windows.timer_start_timestamp
    group by
        intervals.run_id,
        intervals.record_index
),

timer_intervals as (
    select
        intervals.*,
        intervals.analysis_distance_m - intervals.interval_start_distance_m as interval_distance_m,
        coalesce(overlaps.timer_running_duration_seconds, 0.0)
            as timer_running_duration_seconds,
        case
            when intervals.interval_duration_seconds > 0
            then greatest(
                intervals.analysis_distance_m - intervals.interval_start_distance_m,
                0.0
            ) * coalesce(overlaps.timer_running_duration_seconds, 0.0)
                / intervals.interval_duration_seconds
            else 0.0
        end as timer_running_distance_m,
        case
            when intervals.heart_rate > 0 and intervals.previous_heart_rate > 0
            then (intervals.heart_rate + intervals.previous_heart_rate) / 2.0
        end as interval_heart_rate
    from record_intervals as intervals
    left join timer_interval_overlaps as overlaps
        on intervals.run_id = overlaps.run_id
            and intervals.record_index = overlaps.record_index
),

ordered_intervals as (
    select
        *,
        sum(timer_running_distance_m) over (
            partition by run_id
            order by record_index
            rows between unbounded preceding and current row
        ) - timer_running_distance_m as timer_distance_start_m,
        sum(timer_running_distance_m) over (
            partition by run_id
            order by record_index
            rows between unbounded preceding and current row
        ) as timer_distance_end_m,
        sum(timer_running_distance_m) over (
            partition by run_id
        ) as total_timer_running_distance_m,
        sum(timer_running_duration_seconds) over (
            partition by run_id
        ) as total_timer_running_duration_seconds
    from timer_intervals
),

allocated_halves as (
    select
        *,
        total_timer_running_distance_m / 2.0 as midpoint_distance_m,
        greatest(
            least(total_timer_running_distance_m / 2.0, timer_distance_end_m)
                - timer_distance_start_m,
            0.0
        ) as first_half_distance_m,
        greatest(
            timer_distance_end_m
                - greatest(total_timer_running_distance_m / 2.0, timer_distance_start_m),
            0.0
        ) as second_half_distance_m
    from ordered_intervals
),

half_interval_metrics as (
    select
        *,
        case
            when timer_running_duration_seconds <= 0 then 0.0
            when timer_running_distance_m > 0
            then timer_running_duration_seconds * first_half_distance_m / timer_running_distance_m
            when timer_distance_start_m < midpoint_distance_m then timer_running_duration_seconds
            else 0.0
        end as first_half_timer_running_duration_seconds,
        case
            when timer_running_duration_seconds <= 0 then 0.0
            when timer_running_distance_m > 0
            then timer_running_duration_seconds * second_half_distance_m / timer_running_distance_m
            when timer_distance_start_m >= midpoint_distance_m then timer_running_duration_seconds
            else 0.0
        end as second_half_timer_running_duration_seconds,
        case
            when timer_running_duration_seconds > 0 and interval_heart_rate is not null then 1
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
            sum(timer_running_duration_seconds) as missing_duration_seconds
        from missing_hr_groups
        where timer_running_duration_seconds > 0
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
        max(total_timer_running_distance_m) as timer_running_distance_m,
        max(total_timer_running_duration_seconds) as timer_running_duration_seconds,
        sum(first_half_distance_m) as first_half_distance_m,
        sum(second_half_distance_m) as second_half_distance_m,
        sum(first_half_timer_running_duration_seconds)
            as first_half_timer_running_duration_seconds,
        sum(second_half_timer_running_duration_seconds)
            as second_half_timer_running_duration_seconds,
        sum(case
            when has_interval_heart_rate = 1 then first_half_timer_running_duration_seconds
            else 0.0
        end) / nullif(sum(first_half_timer_running_duration_seconds), 0.0)
            as first_half_hr_coverage_ratio,
        sum(case
            when has_interval_heart_rate = 1 then second_half_timer_running_duration_seconds
            else 0.0
        end) / nullif(sum(second_half_timer_running_duration_seconds), 0.0)
            as second_half_hr_coverage_ratio,
        sum(case
            when has_interval_heart_rate = 1
            then interval_heart_rate * first_half_timer_running_duration_seconds
            else 0.0
        end) / nullif(sum(case
            when has_interval_heart_rate = 1 then first_half_timer_running_duration_seconds
            else 0.0
        end), 0.0) as first_half_avg_heart_rate,
        sum(case
            when has_interval_heart_rate = 1
            then interval_heart_rate * second_half_timer_running_duration_seconds
            else 0.0
        end) / nullif(sum(case
            when has_interval_heart_rate = 1 then second_half_timer_running_duration_seconds
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
        and avg_speed_kmh >= {{ minimum_segment_speed_kmh }}
        and avg_heart_rate > 0
    group by run_id
),

quality as (
    select
        halves.*,
        context.session_timer_duration_seconds,
        context.timer_start_count,
        context.timer_stop_count,
        context.timer_window_count,
        context.timer_event_duration_seconds,
        coalesce(segments.valid_segment_count, 0) as valid_segment_count,
        coalesce(gaps.maximum_hr_gap_seconds, 0.0) as maximum_hr_gap_seconds,
        timer_running_duration_seconds / nullif(timer_event_duration_seconds, 0.0)
            as timer_telemetry_coverage_ratio,
        first_half_distance_m / nullif(first_half_timer_running_duration_seconds, 0.0) * 3.6
            as first_half_speed_kmh,
        second_half_distance_m / nullif(second_half_timer_running_duration_seconds, 0.0) * 3.6
            as second_half_speed_kmh,
        (
            first_half_timer_running_duration_seconds * first_half_hr_coverage_ratio
            + second_half_timer_running_duration_seconds * second_half_hr_coverage_ratio
        ) / nullif(timer_running_duration_seconds, 0.0) as hr_coverage_ratio
    from half_rollups as halves
    left join run_timer_context as context
        on halves.run_id = context.run_id
    left join valid_segments as segments
        on halves.run_id = segments.run_id
    left join maximum_hr_gaps as gaps
        on halves.run_id = gaps.run_id
),

timer_gate_checks as (
    select
        *,
        timer_start_count = 0
            or timer_start_count != timer_stop_count
            or timer_window_count != timer_start_count
            or timer_event_duration_seconds is null
            or session_timer_duration_seconds is null
            or abs(timer_event_duration_seconds - session_timer_duration_seconds)
                > {{ timer_reconciliation_tolerance_seconds }}
            as invalid_timer_events
    from quality
),

gate_checks as (
    select
        *,
        not invalid_timer_events
            and abs(timer_running_duration_seconds - timer_event_duration_seconds)
                > {{ timer_reconciliation_tolerance_seconds }}
            as incomplete_timer_telemetry,
        not invalid_timer_events
            and timer_running_duration_seconds < {{ minimum_timer_running_duration_seconds }}
            as insufficient_timer_running_duration,
        not invalid_timer_events
            and timer_running_distance_m < {{ minimum_timer_running_distance_m }}
            as insufficient_timer_running_distance,
        not invalid_timer_events
            and valid_segment_count < {{ minimum_valid_segments }}
            as insufficient_valid_segments,
        not invalid_timer_events
            and (
                hr_coverage_ratio < {{ minimum_hr_coverage_ratio }}
                or first_half_hr_coverage_ratio < {{ minimum_hr_coverage_ratio }}
                or second_half_hr_coverage_ratio < {{ minimum_hr_coverage_ratio }}
            ) as insufficient_hr_coverage,
        not invalid_timer_events
            and maximum_hr_gap_seconds > {{ maximum_hr_gap_seconds }}
            as excessive_hr_gap,
        not invalid_timer_events
            and (first_half_avg_heart_rate is null or second_half_avg_heart_rate is null)
            as missing_half_heart_rate,
        not invalid_timer_events
            and (first_half_speed_kmh <= 0 or second_half_speed_kmh <= 0)
            as invalid_half_speed
    from timer_gate_checks
),

scored as (
    select
        *,
        first_half_speed_kmh / nullif(first_half_avg_heart_rate, 0.0) as first_half_efficiency_ratio,
        second_half_speed_kmh / nullif(second_half_avg_heart_rate, 0.0) as second_half_efficiency_ratio,
        case
            when invalid_timer_events then 'invalid_timer_events'
            when incomplete_timer_telemetry then 'incomplete_timer_telemetry'
            when insufficient_timer_running_duration then 'insufficient_timer_running_duration'
            when insufficient_timer_running_distance then 'insufficient_timer_running_distance'
            when insufficient_valid_segments then 'insufficient_valid_segments'
            when insufficient_hr_coverage then 'insufficient_hr_coverage'
            when excessive_hr_gap then 'excessive_hr_gap'
            when missing_half_heart_rate then 'missing_half_heart_rate'
            when invalid_half_speed then 'invalid_half_speed'
        end as aerobic_decoupling_unavailable_reason,
        to_json(filter(array(
            case when invalid_timer_events then named_struct(
                'code', 'invalid_timer_events',
                'observed', concat(
                    'FIT timers: ', cast(timer_start_count as string), ' starts, ',
                    cast(timer_stop_count as string), ' stops, ',
                    cast(timer_window_count as string), ' complete windows'
                ),
                'required', 'matching start/stop windows that reconcile with the session'
            ) end,
            case when incomplete_timer_telemetry then named_struct(
                'code', 'incomplete_timer_telemetry',
                'observed', concat(cast(round(timer_running_duration_seconds, 0) as string),
                    ' sec of timer-running telemetry'),
                'required', concat(cast(round(timer_event_duration_seconds, 0) as string),
                    ' sec covered by FIT timer events')
            ) end,
            case when insufficient_timer_running_duration then named_struct(
                'code', 'insufficient_timer_running_duration',
                'observed', concat(cast(round(timer_running_duration_seconds, 0) as string),
                    ' sec timer-running time'),
                'required', 'at least {{ minimum_timer_running_duration_seconds }} sec'
            ) end,
            case when insufficient_timer_running_distance then named_struct(
                'code', 'insufficient_timer_running_distance',
                'observed', concat(cast(round(timer_running_distance_m, 0) as string),
                    ' m timer-running distance'),
                'required', 'at least {{ minimum_timer_running_distance_m }} m'
            ) end,
            case when insufficient_valid_segments then named_struct(
                'code', 'insufficient_valid_segments',
                'observed', concat(cast(valid_segment_count as string), ' valid 250 m HR segments'),
                'required', 'at least {{ minimum_valid_segments }} segments'
            ) end,
            case when insufficient_hr_coverage then named_struct(
                'code', 'insufficient_hr_coverage',
                'observed', concat(
                    cast(round(hr_coverage_ratio * 100, 0) as string), '% overall; ',
                    cast(round(first_half_hr_coverage_ratio * 100, 0) as string), '% first half; ',
                    cast(round(second_half_hr_coverage_ratio * 100, 0) as string), '% second half'
                ),
                'required', 'at least {{ minimum_hr_coverage_ratio * 100 }}% in both halves'
            ) end,
            case when excessive_hr_gap then named_struct(
                'code', 'excessive_hr_gap',
                'observed', concat(cast(round(maximum_hr_gap_seconds, 0) as string),
                    ' sec longest missing HR span'),
                'required', 'no gap longer than {{ maximum_hr_gap_seconds }} sec'
            ) end,
            case when missing_half_heart_rate then named_struct(
                'code', 'missing_half_heart_rate',
                'observed', case
                    when first_half_avg_heart_rate is null and second_half_avg_heart_rate is null
                        then 'both halves have no usable heart-rate data'
                    when first_half_avg_heart_rate is null
                        then 'first half has no usable heart-rate data'
                    else 'second half has no usable heart-rate data'
                end,
                'required', 'usable heart-rate data in both halves'
            ) end,
            case when invalid_half_speed then named_struct(
                'code', 'invalid_half_speed',
                'observed', case
                    when first_half_speed_kmh <= 0 and second_half_speed_kmh <= 0
                        then 'both halves have no positive moving speed'
                    when first_half_speed_kmh <= 0 then 'first half has no positive moving speed'
                    else 'second half has no positive moving speed'
                end,
                'required', 'positive moving speed in both halves'
            ) end
        ), gate -> gate is not null)) as aerobic_decoupling_failed_gates
    from gate_checks
)

select
    runs.run_id,
    runs.activity_id,
    runs.activity_date,
    scored.timer_running_distance_m,
    scored.timer_running_duration_seconds,
    scored.timer_event_duration_seconds,
    scored.timer_telemetry_coverage_ratio,
    coalesce(scored.valid_segment_count, 0) as valid_segment_count,
    scored.hr_coverage_ratio,
    scored.maximum_hr_gap_seconds,
    scored.first_half_distance_m,
    scored.second_half_distance_m,
    scored.first_half_timer_running_duration_seconds,
    scored.second_half_timer_running_duration_seconds,
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
        when scored.run_id is null then 'missing_timer_telemetry'
        else scored.aerobic_decoupling_unavailable_reason
    end as aerobic_decoupling_unavailable_reason,
    case
        when scored.run_id is null then to_json(array(named_struct(
            'code', 'missing_timer_telemetry',
            'observed', 'No FIT timer-running telemetry was recorded',
            'required', 'FIT timer start and stop events with matching record telemetry'
        )))
        else scored.aerobic_decoupling_failed_gates
    end as aerobic_decoupling_failed_gates
from {{ ref('runs') }} as runs
left join scored
    on runs.run_id = scored.run_id
