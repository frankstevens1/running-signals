{{ config(materialized='table') }}

with roots as (
    select *
    from {{ ref('int_route_component_roots') }}
),

state_7 as (
    select
        prev.route_order,
        coalesce(prev_root.component_root, prev.component_root) as component_root
    from roots prev
    left join roots prev_root on prev.component_root = prev_root.route_order
),

{% for i in range(8, 13) %}
state_{{ i }} as (
    select
        prev.route_order,
        coalesce(prev_root.component_root, prev.component_root) as component_root
    from state_{{ i - 1 }} prev
    left join state_{{ i - 1 }} prev_root on prev.component_root = prev_root.route_order
),
{% endfor %}

connected_components as (
    select
        roots.run_id,
        state_12.component_root as route_representative_route_order
    from roots
    inner join state_12 on roots.route_order = state_12.route_order
),

component_members as (
    select distinct
        assigned.run_id,
        member.run_id as component_run_id
    from connected_components assigned
    inner join connected_components member
        on assigned.route_representative_route_order = member.route_representative_route_order
),

route_representatives as (
    select
        cc.run_id,
        rep.run_id as route_representative_run_id
    from connected_components cc
    inner join roots rep on cc.route_representative_route_order = rep.route_order
),

component_match_similarity as (
    select
        rr.run_id,
        case
            when rr.run_id = rr.route_representative_run_id then 1.0
            else max(route_edges.route_similarity)
        end as route_match_similarity
    from route_representatives rr
    left join component_members cm
        on rr.run_id = cm.run_id
            and rr.run_id != cm.component_run_id
    left join {{ ref('route_similarity_edges') }} as route_edges
        on rr.run_id = route_edges.run_id
            and cm.component_run_id = route_edges.connected_run_id
    group by
        rr.run_id,
        rr.route_representative_run_id
),

representative_routes as (
    select *
    from {{ ref('route_observations') }}
)

select
    rr.run_id,
    sha2(concat_ws(
        '|',
        cast(representative_routes.route_distance_bucket_km as string),
        representative_routes.route_h3_signature
    ), 256) as route_id,
    rr.route_representative_run_id,
    component_match_similarity.route_match_similarity,
    representative_routes.route_distance_bucket_km,
    representative_routes.start_h3_cell_resolution_9,
    representative_routes.end_h3_cell_resolution_9,
    representative_routes.route_h3_signature
from route_representatives rr
inner join component_match_similarity
    on rr.run_id = component_match_similarity.run_id
inner join representative_routes
    on rr.route_representative_run_id = representative_routes.run_id
