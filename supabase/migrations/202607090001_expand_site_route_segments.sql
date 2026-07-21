alter table public.site_route_segments
    add column if not exists segment_duration_seconds double precision,
    add column if not exists segment_pace_min_per_km double precision,
    add column if not exists avg_speed_kmh double precision,
    add column if not exists max_heart_rate double precision,
    add column if not exists avg_running_cadence double precision,
    add column if not exists min_altitude_m double precision,
    add column if not exists max_altitude_m double precision,
    add column if not exists elevation_change_m double precision,
    add column if not exists segment_grade double precision,
    add column if not exists segment_start_distance_km double precision,
    add column if not exists segment_end_distance_km double precision;

create index if not exists site_route_segments_run_idx
    on public.site_route_segments (run_id, segment_index);
