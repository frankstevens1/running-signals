drop function if exists public.site_run_filter_bounds_for_window(date, date);

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
    max_gps_coverage double precision,
    min_route_altitude_range_m double precision,
    max_route_altitude_range_m double precision
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
        max(record_distance_coverage_ratio),
        min(route_altitude_range_m),
        max(route_altitude_range_m)
    from public.site_runs_core
    where (p_from is null or activity_date >= p_from)
      and (p_to is null or activity_date <= p_to);
$$;

grant execute on function public.site_run_filter_bounds_for_window(date, date)
    to anon, authenticated;

notify pgrst, 'reload schema';
