drop view if exists public.site_run_filter_bounds;
drop view if exists public.site_runs;
drop view if exists public.site_days;
drop view if exists public.site_fitness;
drop view if exists public.site_dashboard_summary;

create view public.site_runs
with (security_invoker = true)
as
select *
from public.site_runs_core;

create view public.site_days
with (security_invoker = true)
as
select *
from public.site_days_core;

create view public.site_fitness
with (security_invoker = true)
as
select *
from public.site_fitness_core;

create view public.site_dashboard_summary
with (security_invoker = true)
as
select *
from public.site_dashboard_summary_core;

grant select on public.site_runs to anon, authenticated;
grant select on public.site_days to anon, authenticated;
grant select on public.site_fitness to anon, authenticated;
grant select on public.site_dashboard_summary to anon, authenticated;

drop table if exists public.site_health_days;

delete from public.site_metadata
where metadata_key like 'health\_%' escape '\';

drop table if exists public.site_months;
drop table if exists public.site_years;

alter table public.site_routes
    drop column if exists min_route_match_similarity,
    drop column if exists avg_route_match_similarity,
    drop column if exists route_h3_signature;

drop index if exists public.site_routes_rank_idx;
create index site_routes_rank_idx
    on public.site_routes (
        run_count desc,
        latest_observed_activity_date desc nulls last,
        route_id
    );

drop index if exists public.site_route_segments_route_idx;
drop index if exists public.site_route_segments_order_idx;
drop index if exists public.site_route_segments_route_resolution_idx;

alter table public.site_route_segments
    drop constraint if exists site_route_segments_positive_length_check,
    drop constraint if exists site_route_segments_boundary_order_check,
    drop column if exists route_id,
    drop column if exists activity_date,
    drop column if exists segment_length_m,
    drop column if exists segment_length_label,
    drop column if exists is_canonical,
    drop column if exists segment_start_boundary_m,
    drop column if exists segment_end_boundary_m,
    drop column if exists segment_start_distance_m,
    drop column if exists segment_end_distance_m,
    drop column if exists segment_distance_m,
    drop column if exists segment_distance_value,
    drop column if exists avg_speed_kmh,
    drop column if exists min_altitude_m,
    drop column if exists max_altitude_m,
    drop column if exists segment_start_latitude_deg,
    drop column if exists segment_start_longitude_deg,
    drop column if exists segment_end_latitude_deg,
    drop column if exists segment_end_longitude_deg;

create or replace function public.site_run_filter_bounds_for_window(
    p_from date default null,
    p_to date default null
)
returns table (
    min_activity_date date,
    max_activity_date date,
    min_distance_km double precision,
    max_distance_km double precision,
    min_pace_min_per_km double precision,
    max_pace_min_per_km double precision,
    min_avg_heart_rate double precision,
    max_avg_heart_rate double precision,
    min_gps_coverage double precision,
    max_gps_coverage double precision
)
language sql
stable
set search_path = public
as $$
    select
        min(activity_date),
        max(activity_date),
        min(distance_km),
        max(distance_km),
        min(avg_pace_min_per_km),
        max(avg_pace_min_per_km),
        min(avg_heart_rate),
        max(avg_heart_rate),
        min(record_distance_coverage_ratio),
        max(record_distance_coverage_ratio)
    from public.site_runs_core
    where (p_from is null or activity_date >= p_from)
      and (p_to is null or activity_date <= p_to);
$$;

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
            routes.representative_route_centroid_longitude_deg
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

create or replace function public.site_period_summary(
    p_from date default null,
    p_to date default null
)
returns table (
    latest_completed_date date,
    total_runs bigint,
    total_distance_km double precision,
    recent_7d_distance_km double precision,
    recent_28d_distance_km double precision,
    active_weeks bigint,
    active_months bigint
)
language sql
stable
set search_path = public
as $$
    with filtered_days as (
        select *
        from public.site_days_core
        where (p_from is null or calendar_date >= p_from)
          and (p_to is null or calendar_date <= p_to)
    ),
    latest as (
        select max(calendar_date) as latest_completed_date
        from filtered_days
    )
    select
        latest.latest_completed_date,
        coalesce(sum(days.run_count), 0)::bigint as total_runs,
        coalesce(sum(days.distance_km), 0.0) as total_distance_km,
        coalesce(sum(days.distance_km) filter (
            where days.calendar_date >= latest.latest_completed_date - 6
        ), 0.0) as recent_7d_distance_km,
        coalesce(sum(days.distance_km) filter (
            where days.calendar_date >= latest.latest_completed_date - 27
        ), 0.0) as recent_28d_distance_km,
        count(distinct date_trunc('week', days.calendar_date + interval '1 day') - interval '1 day') filter (
            where days.active_day_flag
        ) as active_weeks,
        count(distinct date_trunc('month', days.calendar_date)) filter (
            where days.active_day_flag
        ) as active_months
    from filtered_days as days
    cross join latest
    group by latest.latest_completed_date;
$$;

grant execute on function public.site_run_filter_bounds_for_window(date, date)
    to anon, authenticated;
grant execute on function public.site_route_summaries(date, date, integer, integer)
    to anon, authenticated;
grant execute on function public.site_period_summary(date, date)
    to anon, authenticated;

notify pgrst, 'reload schema';
