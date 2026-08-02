drop function if exists public.site_route_summaries(date, date, integer, integer);
create or replace function public.site_route_summaries(
    p_from date default null,
    p_to date default null,
    p_limit integer default 100,
    p_offset integer default 0
)
returns table (
    route_id text,
    latest_observed_activity_date date,
    run_count bigint,
    avg_distance_km double precision,
    avg_pace_min_per_km double precision,
    avg_heart_rate double precision,
    representative_route_centroid_latitude_deg double precision,
    representative_route_centroid_longitude_deg double precision,
    city_name text,
    country_name text,
    country_code text,
    total_count bigint
)
language sql
stable
set search_path = public
as $$
    with route_aggregates as (
        select
            runs.route_id,
            max(runs.activity_date) as latest_observed_activity_date,
            count(*) as run_count,
            avg(runs.distance_km) as avg_distance_km,
            avg(runs.avg_pace_min_per_km) as avg_pace_min_per_km,
            avg(runs.avg_heart_rate) as avg_heart_rate
        from public.site_runs_core as runs
        where runs.route_id is not null
          and (p_from is null or runs.activity_date >= p_from)
          and (p_to is null or runs.activity_date <= p_to)
        group by runs.route_id
    ),
    summaries as (
        select
            aggregates.route_id,
            aggregates.latest_observed_activity_date,
            aggregates.run_count,
            aggregates.avg_distance_km,
            aggregates.avg_pace_min_per_km,
            aggregates.avg_heart_rate,
            routes.representative_route_centroid_latitude_deg,
            routes.representative_route_centroid_longitude_deg,
            routes.city_name,
            routes.country_name,
            routes.country_code
        from route_aggregates as aggregates
        inner join public.site_routes as routes using (route_id)
    )
    select
        summaries.*,
        count(*) over () as total_count
    from summaries
    order by
        run_count desc,
        latest_observed_activity_date desc nulls last,
        route_id
    limit least(greatest(p_limit, 1), 1000)
    offset greatest(p_offset, 0);
$$;

grant execute on function public.site_route_summaries(date, date, integer, integer)
    to authenticated, anon;
