create table public.site_activity_records (
    run_id text not null,
    activity_id text not null,
    route_id text,
    is_route_representative boolean not null default false,
    activity_date date not null,
    record_timestamp text not null,
    record_index bigint not null,
    elapsed_seconds bigint not null,
    seconds_since_previous_record bigint,
    record_distance_m double precision,
    record_distance_km double precision,
    distance_delta_m double precision,
    speed_mps double precision,
    speed_kmh double precision,
    pace_min_per_km double precision,
    heart_rate double precision,
    running_cadence double precision,
    altitude_m double precision,
    altitude_delta_m double precision,
    temperature double precision,
    position_lat_deg double precision,
    position_long_deg double precision,
    primary key (run_id, record_index),
    constraint site_activity_records_positive_index check (record_index > 0),
    constraint site_activity_records_nonnegative_elapsed check (elapsed_seconds >= 0)
);

create index site_activity_records_activity_date_idx
    on public.site_activity_records (activity_date desc, run_id, record_index);

create index site_activity_records_route_idx
    on public.site_activity_records (
        route_id,
        is_route_representative,
        run_id,
        record_index
    )
    where route_id is not null;

alter table public.site_activity_records enable row level security;

create policy "Allow public read"
    on public.site_activity_records for select
    to anon, authenticated
    using (true);

grant select on public.site_activity_records to anon, authenticated;

alter table public.site_route_segments
    add column unit_system text,
    add column segment_length_value double precision,
    add column segment_length_m double precision,
    add column segment_length_label text,
    add column is_canonical boolean,
    add column segment_start_boundary_m double precision,
    add column segment_end_boundary_m double precision,
    add column segment_start_distance_m double precision,
    add column segment_end_distance_m double precision,
    add column segment_distance_m double precision,
    add column segment_distance_value double precision;

update public.site_route_segments
set
    unit_system = 'metric',
    segment_length_value = 0.25,
    segment_length_m = 250.0,
    segment_length_label = '250 m',
    is_canonical = true,
    segment_start_boundary_m = (segment_index - 1) * 250.0,
    segment_end_boundary_m = segment_index * 250.0,
    segment_start_distance_m = segment_start_distance_km * 1000.0,
    segment_end_distance_m = segment_end_distance_km * 1000.0,
    segment_distance_m = segment_distance_km * 1000.0,
    segment_distance_value = segment_distance_km;

alter table public.site_route_segments
    alter column unit_system set not null,
    alter column segment_length_value set not null,
    alter column segment_length_m set not null,
    alter column segment_length_label set not null,
    alter column is_canonical set not null,
    alter column segment_start_boundary_m set not null,
    alter column segment_end_boundary_m set not null,
    drop constraint site_route_segments_pkey,
    add primary key (run_id, unit_system, segment_length_value, segment_index),
    add constraint site_route_segments_unit_system_check
        check (unit_system in ('metric', 'imperial')),
    add constraint site_route_segments_positive_length_check
        check (segment_length_value > 0 and segment_length_m > 0),
    add constraint site_route_segments_boundary_order_check
        check (segment_end_boundary_m > segment_start_boundary_m);

drop index if exists public.site_route_segments_run_idx;

create index site_route_segments_route_resolution_idx
    on public.site_route_segments (
        route_id,
        unit_system,
        segment_length_value,
        run_id,
        segment_index
    );
