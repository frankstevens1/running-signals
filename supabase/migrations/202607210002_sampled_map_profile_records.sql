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
language sql
stable
set search_path = public
as $$
    with requested_records as (
        select
            records.record_index,
            records.record_distance_km,
            records.altitude_m,
            records.position_lat_deg,
            records.position_long_deg
        from public.site_activity_records as records
        where p_run_id is not null
          and p_route_id is null
          and records.run_id = p_run_id

        union all

        select
            records.record_index,
            records.record_distance_km,
            records.altitude_m,
            records.position_lat_deg,
            records.position_long_deg
        from public.site_activity_records as records
        where p_run_id is null
          and p_route_id is not null
          and records.route_id = p_route_id
          and records.is_route_representative = true
    ),

    ordered_records as (
        select
            requested_records.*,
            row_number() over (order by record_index) as record_order,
            count(*) over () as record_count
        from requested_records
    ),

    sample_offsets as (
        select generate_series(0, 499)::bigint as sample_index
    ),

    sampled_records as (
        select
            record_index,
            record_distance_km,
            altitude_m,
            position_lat_deg,
            position_long_deg
        from ordered_records
        where record_count <= 500

        union all

        select
            records.record_index,
            records.record_distance_km,
            records.altitude_m,
            records.position_lat_deg,
            records.position_long_deg
        from ordered_records as records
        inner join sample_offsets
            on records.record_order =
                floor(sample_offsets.sample_index * (records.record_count - 1) / 499.0)::bigint + 1
        where records.record_count > 500
    )

    select
        record_index,
        record_distance_km,
        altitude_m,
        position_lat_deg,
        position_long_deg
    from sampled_records
    order by record_index;
$$;

grant execute on function public.site_map_profile_records(text, text)
    to anon, authenticated;
