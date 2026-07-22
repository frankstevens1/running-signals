{{ config(materialized='table') }}

with observations as (
    select
        run_id,
        activity_date,
        activity_id,
        row_number() over (order by activity_date, activity_id, run_id) as route_order
    from {{ ref('route_observations') }}
),

ordered_edges as (
    select
        l.route_order as run_order,
        r.route_order as connected_order
    from {{ ref('route_similarity_edges') }} as edges
    inner join observations as l
        on edges.run_id = l.run_id
    inner join observations as r
        on edges.connected_run_id = r.run_id
),

state_0 as (
    select
        observations.route_order,
        least(
            observations.route_order,
            min(coalesce(e.connected_order, observations.route_order))
        ) as component_root
    from observations
    left join ordered_edges e on observations.route_order = e.run_order
    group by observations.route_order
),

{% for i in range(1, 7) %}
state_{{ i }} as (
    select
        prev.route_order,
        coalesce(prev_root.component_root, prev.component_root) as component_root
    from state_{{ i - 1 }} prev
    left join state_{{ i - 1 }} prev_root on prev.component_root = prev_root.route_order
){% if not loop.last %},{% endif %}

{% endfor %}

select
    observations.run_id,
    observations.route_order,
    state_6.component_root
from observations
inner join state_6
    on observations.route_order = state_6.route_order
