{{ config(materialized='table') }}

with runs as (
    select
        run_id,
        activity_id,
        activity_date,
        distance_km
    from {{ ref('runs') }}
),

legacy_route_records as (
    select
        run_id,
        cast(floor(record_distance_m / 250.0) as int) + 1 as segment_index,
        h3_cell_resolution_8,
        h3_cell_resolution_9,
        row_number() over (
            partition by
                run_id,
                cast(floor(record_distance_m / 250.0) as int) + 1
            order by
                record_distance_m,
                record_index
        ) as representative_rank
    from {{ ref('run_records') }}
    where record_distance_m is not null
),

legacy_route_segments as (
    -- Preserve the original floor-bucket path with deterministic equal-distance ties.
    select
        run_id,
        segment_index,
        max(case
            when representative_rank = 1 then h3_cell_resolution_8
        end) as representative_h3_cell_resolution_8,
        max(case
            when representative_rank = 1 then h3_cell_resolution_9
        end) as representative_h3_cell_resolution_9
    from legacy_route_records
    group by
        run_id,
        segment_index
),

route_cells as (
    select
        runs.run_id,
        runs.activity_id,
        runs.activity_date,
        runs.distance_km,
        segments.segment_index,
        cast(segments.representative_h3_cell_resolution_8 as string) as h3_cell_resolution_8,
        cast(segments.representative_h3_cell_resolution_9 as string) as h3_cell_resolution_9
    from legacy_route_segments as segments
    inner join runs
        on segments.run_id = runs.run_id
    where segments.representative_h3_cell_resolution_8 is not null
        and segments.representative_h3_cell_resolution_9 is not null
        and runs.distance_km is not null
        and runs.distance_km > 0
),

route_observations as (
    select
        run_id,
        activity_id,
        activity_date,
        distance_km,
        round(distance_km * 2.0) / 2.0 as route_distance_bucket_km,
        min_by(h3_cell_resolution_9, segment_index) as start_h3_cell_resolution_9,
        max_by(h3_cell_resolution_9, segment_index) as end_h3_cell_resolution_9,
        transform(
            array_sort(collect_list(named_struct(
                'segment_index', segment_index,
                'h3_cell', h3_cell_resolution_8
            ))),
            cell -> cell.h3_cell
        ) as route_h3_path_resolution_8,
        concat_ws('>', transform(
            array_sort(collect_list(named_struct(
                'segment_index', segment_index,
                'h3_cell', h3_cell_resolution_9
            ))),
            cell -> cell.h3_cell
        )) as route_h3_signature,
        count(*) as segment_count
    from route_cells
    group by
        run_id,
        activity_id,
        activity_date,
        distance_km
)

select *
from route_observations
