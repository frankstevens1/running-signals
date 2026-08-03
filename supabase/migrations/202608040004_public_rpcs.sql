create function public.site_run_filter_bounds_for_window(
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
security invoker
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

create function public.site_route_summaries(
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
security invoker
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

create function public.site_period_summary(
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
security invoker
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

create function public.site_map_profile_records(
    p_run_id text default null,
    p_route_id text default null
)
returns table (
    record_index bigint,
    record_distance_km double precision,
    altitude_m double precision,
    pace_min_per_km double precision,
    heart_rate double precision,
    position_lat_deg double precision,
    position_long_deg double precision
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
    target_run_id text;
begin
    if (p_run_id is null) = (p_route_id is null) then
        raise exception 'Pass exactly one of p_run_id or p_route_id'
            using errcode = '22023';
    end if;

    if p_run_id is not null then
        target_run_id := p_run_id;
    else
        select route_representative_run_id
        into target_run_id
        from public.site_routes
        where route_id = p_route_id;
    end if;

    if target_run_id is null then
        return;
    end if;

    return query
    select
        records.record_index,
        records.record_distance_km,
        records.altitude_m,
        records.pace_min_per_km,
        records.heart_rate,
        records.position_lat_deg,
        records.position_long_deg
    from public.site_map_profile_records as records
    where records.run_id = target_run_id
    order by records.record_index;
end;
$$;
