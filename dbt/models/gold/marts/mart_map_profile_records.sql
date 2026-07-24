{{ config(materialized='table') }}

with ordered_records as (
    select
        run_id,
        record_index,
        record_distance_km,
        altitude_m,
        position_lat_deg,
        position_long_deg,
        row_number() over (
            partition by run_id
            order by record_index
        ) as record_order,
        count(*) over (partition by run_id) as record_count
    from {{ ref('mart_activity_records') }}
),

sample_offsets as (
    select explode(sequence(0, 499)) as sample_index
),

sampled_records as (
    select
        run_id,
        record_index,
        record_distance_km,
        altitude_m,
        position_lat_deg,
        position_long_deg
    from ordered_records
    where record_count <= 500

    union all

    select
        records.run_id,
        records.record_index,
        records.record_distance_km,
        records.altitude_m,
        records.position_lat_deg,
        records.position_long_deg
    from ordered_records as records
    inner join sample_offsets
        on records.record_order = cast(
            floor(sample_offsets.sample_index * (records.record_count - 1) / 499.0) as bigint
        ) + 1
    where records.record_count > 500
)

select *
from sampled_records
