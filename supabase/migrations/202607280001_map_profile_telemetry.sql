alter table public.site_map_profile_records
    add column pace_min_per_km double precision,
    add column heart_rate double precision;

drop function if exists public.site_map_profile_records(text, text);

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

grant execute on function public.site_map_profile_records(text, text)
    to anon, authenticated;
