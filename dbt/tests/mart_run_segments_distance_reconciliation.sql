with record_totals as (
    select
        run_id,
        greatest(max(record_distance_m), 0.0) as record_distance_m,
        cast(
            unix_timestamp(max(record_timestamp)) - unix_timestamp(min(record_timestamp))
            as double
        ) as record_duration_seconds
    from {{ ref('silver_run_records') }}
    where record_distance_m is not null
    group by run_id
),

segment_totals as (
    select
        run_id,
        unit_system,
        segment_length_value,
        sum(segment_distance_m) as segmented_distance_m,
        sum(segment_duration_seconds) as segmented_duration_seconds
    from {{ ref('mart_run_segments') }}
    group by
        run_id,
        unit_system,
        segment_length_value
)

select
    segment_totals.*,
    record_totals.record_distance_m,
    record_totals.record_duration_seconds
from segment_totals
inner join record_totals
    on segment_totals.run_id = record_totals.run_id
where abs(segment_totals.segmented_distance_m - record_totals.record_distance_m)
        > greatest(0.001, record_totals.record_distance_m * 0.000000001)
    or abs(segment_totals.segmented_duration_seconds - record_totals.record_duration_seconds)
        > greatest(0.001, record_totals.record_duration_seconds * 0.000000001)
