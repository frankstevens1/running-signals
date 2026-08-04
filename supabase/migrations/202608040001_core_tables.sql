create table public.site_runs_core (
    run_id text primary key,
    activity_id text not null,
    activity_date date not null,
    start_time text,
    distance_km double precision,
    duration_seconds double precision,
    avg_pace_min_per_km double precision,
    speed_kmh double precision,
    avg_heart_rate double precision,
    max_heart_rate double precision,
    total_ascent double precision,
    total_descent double precision,
    garmin_recovery_hr double precision,
    avg_cadence double precision,
    max_cadence double precision,
    route_id text,
    route_distance_bucket_km double precision,
    record_distance_coverage_ratio double precision,
    segment_count integer,
    avg_segment_grade double precision,
    route_altitude_range_m double precision,
    prior_7d_distance_km double precision,
    prior_28d_distance_km double precision,
    distance_economy_m_per_beat double precision,
    elevation_economy_m_per_beat double precision,
    personal_efficiency_score double precision
);

create table public.site_days_core (
    calendar_date date primary key,
    run_count integer not null default 0,
    distance_km double precision not null default 0,
    duration_seconds double precision not null default 0,
    long_run_distance_km double precision not null default 0,
    active_day_flag boolean not null default false,
    rolling_7d_distance_km double precision,
    rolling_28d_distance_km double precision
);

create table public.site_fitness_core (
    activity_id text primary key,
    activity_date date not null,
    distance_km double precision,
    avg_pace_min_per_km double precision,
    speed_kmh double precision,
    avg_heart_rate double precision,
    ending_heart_rate double precision,
    efficiency_ratio double precision,
    rolling_4_run_efficiency_ratio double precision,
    aerobic_decoupling_pct double precision,
    aerobic_decoupling_status text,
    aerobic_decoupling_unavailable_reason text,
    aerobic_decoupling_moving_duration_seconds double precision,
    aerobic_decoupling_valid_segment_count integer,
    aerobic_decoupling_hr_coverage_ratio double precision,
    aerobic_decoupling_maximum_hr_gap_seconds double precision,
    first_half_speed_kmh double precision,
    second_half_speed_kmh double precision,
    first_half_avg_heart_rate double precision,
    second_half_avg_heart_rate double precision,
    first_half_efficiency_ratio double precision,
    second_half_efficiency_ratio double precision,
    aerobic_decoupling_prior_90d_count integer,
    aerobic_decoupling_prior_90d_median double precision,
    aerobic_decoupling_prior_90d_q1 double precision,
    aerobic_decoupling_prior_90d_q3 double precision,
    rolling_4_run_recovery_hr double precision,
    recovery_prior_90d_count integer,
    recovery_prior_90d_median double precision,
    recovery_prior_90d_q1 double precision,
    recovery_prior_90d_q3 double precision,
    recovery_prior_90d_min double precision,
    recovery_prior_90d_max double precision,
    hr_band text,
    garmin_recovery_hr double precision,
    distance_economy_m_per_beat double precision,
    elevation_economy_m_per_beat double precision,
    personal_efficiency_score double precision
);

create table public.site_dashboard_summary_core (
    summary_key text primary key default 'current',
    latest_completed_date date,
    total_runs integer not null default 0,
    total_distance_km double precision not null default 0,
    recent_7d_distance_km double precision not null default 0,
    recent_28d_distance_km double precision not null default 0,
    active_weeks integer not null default 0,
    active_months integer not null default 0,
    constraint site_dashboard_summary_single_row check (summary_key = 'current')
);

create table public.site_routes (
    route_id text primary key,
    route_representative_run_id text,
    first_observed_activity_date date,
    latest_observed_activity_date date,
    run_count integer not null default 0,
    avg_distance_km double precision,
    min_distance_km double precision,
    max_distance_km double precision,
    avg_duration_seconds double precision,
    avg_pace_min_per_km double precision,
    avg_heart_rate double precision,
    avg_total_ascent double precision,
    avg_total_descent double precision,
    avg_segment_grade double precision,
    avg_route_altitude_range_m double precision,
    route_distance_bucket_km double precision,
    representative_route_centroid_latitude_deg double precision,
    representative_route_centroid_longitude_deg double precision,
    route_start_latitude_deg double precision,
    route_start_longitude_deg double precision,
    city_name text,
    country_name text,
    country_code text,
    country_iso3 text
);

create table public.site_route_segments (
    run_id text not null,
    unit_system text not null,
    segment_length_value double precision not null,
    segment_index integer not null,
    segment_distance_km double precision,
    segment_duration_seconds double precision,
    segment_pace_min_per_km double precision,
    avg_heart_rate double precision,
    max_heart_rate double precision,
    avg_running_cadence double precision,
    elevation_change_m double precision,
    segment_grade double precision,
    segment_start_distance_km double precision,
    segment_end_distance_km double precision,
    primary key (run_id, unit_system, segment_length_value, segment_index),
    constraint site_route_segments_unit_system_check
        check (unit_system in ('metric', 'imperial'))
);

create table public.site_weeks (
    week_start_date date primary key,
    week_end_date date not null,
    runs_per_week integer not null default 0,
    weekly_distance_km double precision not null default 0,
    avg_run_distance_km double precision,
    weekly_duration_seconds double precision not null default 0,
    avg_pace_min_per_km double precision,
    long_run_distance_km double precision,
    long_run_share_of_week double precision,
    active_days integer not null default 0,
    missed_days integer not null default 0,
    active_week_flag boolean not null default false,
    rolling_4w_distance_km double precision,
    rolling_12w_distance_km double precision,
    active_week_streak integer,
    missed_weeks_12w integer
);

create table public.site_map_profile_records (
    run_id text not null,
    record_index bigint not null,
    record_distance_km double precision,
    altitude_m double precision,
    pace_min_per_km double precision,
    heart_rate double precision,
    position_lat_deg double precision,
    position_long_deg double precision,
    primary key (run_id, record_index),
    constraint site_map_profile_records_positive_index check (record_index > 0)
);

create table public.site_metadata (
    metadata_key text primary key,
    metadata_value jsonb not null,
    updated_at timestamp with time zone not null default now()
);
