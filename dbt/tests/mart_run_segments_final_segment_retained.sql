with expected_final_segments as (
    select
        records.run_id,
        resolutions.unit_system,
        resolutions.segment_length_value,
        greatest(
            cast(ceil(
                greatest(max(records.record_distance_m), 0.0)
                / resolutions.segment_length_m
            ) as int),
            1
        ) as expected_final_segment_index
    from {{ ref('run_records') }} as records
    cross join {{ ref('mart_segment_resolutions') }} as resolutions
    where records.record_distance_m is not null
    group by
        records.run_id,
        resolutions.unit_system,
        resolutions.segment_length_value,
        resolutions.segment_length_m
),

actual_final_segments as (
    select
        run_id,
        unit_system,
        segment_length_value,
        max(segment_index) as actual_final_segment_index
    from {{ ref('mart_run_segments') }}
    group by
        run_id,
        unit_system,
        segment_length_value
)

select expected_final_segments.*
from expected_final_segments
left join actual_final_segments
    on expected_final_segments.run_id = actual_final_segments.run_id
        and expected_final_segments.unit_system = actual_final_segments.unit_system
        and expected_final_segments.segment_length_value
            = actual_final_segments.segment_length_value
where actual_final_segments.actual_final_segment_index is null
    or actual_final_segments.actual_final_segment_index
        != expected_final_segments.expected_final_segment_index
