{{ config(materialized='table') }}

with candidate_pairs as (
    select
        left_routes.run_id as left_run_id,
        right_routes.run_id as right_run_id,
        left_routes.segment_count as left_segment_count,
        right_routes.segment_count as right_segment_count
    from {{ ref('route_observations') }} as left_routes
    inner join {{ ref('route_observations') }} as right_routes
        on left_routes.run_id < right_routes.run_id
            and left_routes.route_distance_bucket_km = right_routes.route_distance_bucket_km
            and left_routes.start_h3_cell_resolution_9 = right_routes.start_h3_cell_resolution_9
            and left_routes.end_h3_cell_resolution_9 = right_routes.end_h3_cell_resolution_9
            and abs(left_routes.distance_km - right_routes.distance_km)
                <= least(left_routes.distance_km, right_routes.distance_km) * 0.10
),

route_path_segments as (
    select
        observations.run_id,
        segment_position,
        h3_cell
    from {{ ref('route_observations') }} as observations
    lateral view posexplode(route_h3_path_resolution_8) exploded as segment_position, h3_cell
),

pair_matches as (
    select
        candidate_pairs.left_run_id,
        candidate_pairs.right_run_id,
        count(distinct left_segments.segment_position) as left_matched_segment_count,
        count(distinct right_segments.segment_position) as right_matched_segment_count
    from candidate_pairs
    inner join route_path_segments as left_segments
        on candidate_pairs.left_run_id = left_segments.run_id
    inner join route_path_segments as right_segments
        on candidate_pairs.right_run_id = right_segments.run_id
            and left_segments.h3_cell = right_segments.h3_cell
            and abs(left_segments.segment_position - right_segments.segment_position) <= 1
    group by
        candidate_pairs.left_run_id,
        candidate_pairs.right_run_id
),

similar_route_pairs as (
    select
        candidate_pairs.left_run_id,
        candidate_pairs.right_run_id,
        least(
            coalesce(pair_matches.left_matched_segment_count, 0) * 1.0
                / candidate_pairs.left_segment_count,
            coalesce(pair_matches.right_matched_segment_count, 0) * 1.0
                / candidate_pairs.right_segment_count
        ) as route_similarity
    from candidate_pairs
    left join pair_matches
        on candidate_pairs.left_run_id = pair_matches.left_run_id
            and candidate_pairs.right_run_id = pair_matches.right_run_id
    where least(
        coalesce(pair_matches.left_matched_segment_count, 0) * 1.0
            / candidate_pairs.left_segment_count,
        coalesce(pair_matches.right_matched_segment_count, 0) * 1.0
            / candidate_pairs.right_segment_count
    ) >= 0.90
)

select
    left_run_id as run_id,
    right_run_id as connected_run_id,
    route_similarity
from similar_route_pairs

union all

select
    right_run_id as run_id,
    left_run_id as connected_run_id,
    route_similarity
from similar_route_pairs
