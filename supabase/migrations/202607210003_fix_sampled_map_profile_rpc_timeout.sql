create index if not exists site_activity_records_map_profile_idx
    on public.site_activity_records (run_id, record_index)
    include (
        record_distance_km,
        altitude_m,
        position_lat_deg,
        position_long_deg
    );

create or replace function public.site_map_profile_records(
    p_run_id text default null,
    p_route_id text default null
)
returns table (
    record_index bigint,
    record_distance_km double precision,
    altitude_m double precision,
    position_lat_deg double precision,
    position_long_deg double precision
)
language plpgsql
stable
set search_path = public
as $$
declare
    target_run_id text;
    target_record_count bigint;
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

    select count(*)
    into target_record_count
    from public.site_activity_records
    where run_id = target_run_id;

    if target_record_count <= 500 then
        return query
        select
            records.record_index,
            records.record_distance_km,
            records.altitude_m,
            records.position_lat_deg,
            records.position_long_deg
        from public.site_activity_records as records
        where records.run_id = target_run_id
        order by records.record_index;
        return;
    end if;

    return query
    with record_bounds as (
        select
            min(records.record_index) as first_record_index,
            max(records.record_index) as last_record_index
        from public.site_activity_records as records
        where records.run_id = target_run_id
    ),
    sample_indexes as (
        select
            bounds.first_record_index + floor(
                samples.sample_index * (
                    bounds.last_record_index - bounds.first_record_index
                ) / 499.0
            )::bigint as record_index
        from record_bounds as bounds
        cross join generate_series(0::bigint, 499::bigint) as samples(sample_index)
    )
    select distinct on (records.record_index)
        records.record_index,
        records.record_distance_km,
        records.altitude_m,
        records.position_lat_deg,
        records.position_long_deg
    from sample_indexes
    cross join lateral (
        select
            candidate.record_index,
            candidate.record_distance_km,
            candidate.altitude_m,
            candidate.position_lat_deg,
            candidate.position_long_deg
        from public.site_activity_records as candidate
        where candidate.run_id = target_run_id
          and candidate.record_index >= sample_indexes.record_index
        order by candidate.record_index
        limit 1
    ) as records
    order by records.record_index;
end;
$$;

grant execute on function public.site_map_profile_records(text, text)
    to anon, authenticated;
