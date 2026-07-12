{{ config(materialized='table') }}

with recursive runs as (
    select
        run_id,
        activity_id,
        activity_date,
        distance_km
    from {{ ref('silver_runs') }}
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
    from {{ ref('silver_run_records') }}
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
),

candidate_pairs as (
    select
        left_routes.run_id as left_run_id,
        right_routes.run_id as right_run_id,
        left_routes.segment_count as left_segment_count,
        right_routes.segment_count as right_segment_count
    from route_observations as left_routes
    inner join route_observations as right_routes
        on left_routes.run_id < right_routes.run_id
            and abs(left_routes.distance_km - right_routes.distance_km)
                <= least(left_routes.distance_km, right_routes.distance_km) * 0.10
),

route_path_segments as (
    select
        route_observations.run_id,
        segment_position,
        h3_cell
    from route_observations
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
),

route_edges as (
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
),

route_reachability (
    origin_run_id,
    reached_run_id,
    path
) max recursion level 500 as (
    select
        run_id as origin_run_id,
        run_id as reached_run_id,
        array(run_id) as path
    from route_observations

    union all

    select
        route_reachability.origin_run_id,
        route_edges.connected_run_id as reached_run_id,
        route_reachability.path || array(route_edges.connected_run_id) as path
    from route_reachability
    inner join route_edges
        on route_reachability.reached_run_id = route_edges.run_id
    where not array_contains(route_reachability.path, route_edges.connected_run_id)
),

component_members as (
    select distinct
        origin_run_id as run_id,
        reached_run_id as component_run_id
    from route_reachability
),

ranked_component_representatives as (
    select
        component_members.run_id,
        component_members.component_run_id as route_representative_run_id,
        row_number() over (
            partition by component_members.run_id
            order by
                component_observations.activity_date,
                component_observations.activity_id,
                component_observations.run_id
        ) as representative_rank
    from component_members
    inner join route_observations as component_observations
        on component_members.component_run_id = component_observations.run_id
),

assigned_routes as (
    select
        run_id,
        route_representative_run_id
    from ranked_component_representatives
    where representative_rank = 1
),

component_match_similarity as (
    select
        assigned_routes.run_id,
        case
            when assigned_routes.run_id = assigned_routes.route_representative_run_id then 1.0
            else max(route_edges.route_similarity)
        end as route_match_similarity
    from assigned_routes
    left join component_members
        on assigned_routes.run_id = component_members.run_id
            and assigned_routes.run_id != component_members.component_run_id
    left join route_edges
        on assigned_routes.run_id = route_edges.run_id
            and component_members.component_run_id = route_edges.connected_run_id
    group by
        assigned_routes.run_id,
        assigned_routes.route_representative_run_id
),

representative_routes as (
    select *
    from route_observations
)

select
    assigned_routes.run_id,
    sha2(concat_ws(
        '|',
        cast(representative_routes.route_distance_bucket_km as string),
        representative_routes.route_h3_signature
    ), 256) as route_id,
    assigned_routes.route_representative_run_id,
    component_match_similarity.route_match_similarity,
    representative_routes.route_distance_bucket_km,
    representative_routes.start_h3_cell_resolution_9,
    representative_routes.end_h3_cell_resolution_9,
    representative_routes.route_h3_signature
from assigned_routes
inner join component_match_similarity
    on assigned_routes.run_id = component_match_similarity.run_id
inner join representative_routes
    on assigned_routes.route_representative_run_id = representative_routes.run_id
