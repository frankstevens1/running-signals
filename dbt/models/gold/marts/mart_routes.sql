{{ config(materialized='table') }}

with sessions as (
    select *
    from {{ ref('mart_run_sessions') }}
    where route_id is not null
),

route_summaries as (
    select
        route_id,
        min(route_representative_run_id) as route_representative_run_id,
        min(activity_date) as first_observed_activity_date,
        max(activity_date) as latest_observed_activity_date,
        count(*) as run_count,
        min(route_match_similarity) as min_route_match_similarity,
        avg(route_match_similarity) as avg_route_match_similarity,
        avg(distance_km) as avg_distance_km,
        min(distance_km) as min_distance_km,
        max(distance_km) as max_distance_km,
        avg(duration_seconds) as avg_duration_seconds,
        avg(avg_pace_min_per_km) as avg_pace_min_per_km,
        avg(avg_heart_rate) as avg_heart_rate,
        avg(total_ascent) as avg_total_ascent,
        avg(total_descent) as avg_total_descent,
        avg(segment_count) as avg_segment_count,
        avg(avg_segment_grade) as avg_segment_grade,
        avg(route_altitude_range_m) as avg_route_altitude_range_m,
        min(route_distance_bucket_km) as route_distance_bucket_km,
        min(start_h3_cell_resolution_9) as start_h3_cell_resolution_9,
        min(end_h3_cell_resolution_9) as end_h3_cell_resolution_9,
        min(route_h3_signature) as route_h3_signature
    from sessions
    group by route_id
),

representative_route_centroids as (
    select
        routes.route_id,
        avg(records.position_lat_deg) as representative_route_centroid_latitude_deg,
        avg(records.position_long_deg) as representative_route_centroid_longitude_deg
    from route_summaries as routes
    inner join {{ ref('mart_activity_records') }} as records
        on records.run_id = routes.route_representative_run_id
    where records.position_lat_deg between -90 and 90
      and records.position_long_deg between -180 and 180
    group by routes.route_id
)

select
    routes.*,
    centroids.representative_route_centroid_latitude_deg,
    centroids.representative_route_centroid_longitude_deg,
    concat(
        cast(round(centroids.representative_route_centroid_latitude_deg * 4) / 4.0 as string),
        ', ',
        cast(round(centroids.representative_route_centroid_longitude_deg * 4) / 4.0 as string)
    ) as city_grid_bucket
from route_summaries as routes
left join representative_route_centroids as centroids
    on routes.route_id = centroids.route_id
