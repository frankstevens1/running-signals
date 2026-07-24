create table public.site_map_profile_records (
    run_id text not null,
    record_index bigint not null,
    record_distance_km double precision,
    altitude_m double precision,
    position_lat_deg double precision,
    position_long_deg double precision,
    primary key (run_id, record_index),
    constraint site_map_profile_records_positive_index check (record_index > 0)
);

alter table public.site_map_profile_records enable row level security;

create policy "Allow public read"
    on public.site_map_profile_records for select
    to anon, authenticated
    using (true);

grant select on public.site_map_profile_records to anon, authenticated;

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
        records.position_lat_deg,
        records.position_long_deg
    from public.site_map_profile_records as records
    where records.run_id = target_run_id
    order by records.record_index;
end;
$$;

grant execute on function public.site_map_profile_records(text, text)
    to anon, authenticated;

drop table public.site_activity_records;
