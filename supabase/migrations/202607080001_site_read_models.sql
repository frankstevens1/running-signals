create table public.site_runs (
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
    route_id text,
    route_distance_bucket_km double precision,
    record_distance_coverage_ratio double precision,
    segment_count integer,
    avg_segment_grade double precision,
    route_altitude_range_m double precision,
    resting_heart_rate double precision,
    hrv_value double precision,
    hrv_status text,
    sleep_score double precision,
    sleep_duration_seconds double precision,
    prior_7d_distance_km double precision,
    prior_28d_distance_km double precision
);

create index site_runs_activity_date_idx on public.site_runs (activity_date desc);
create index site_runs_distance_idx on public.site_runs (distance_km);
create index site_runs_pace_idx on public.site_runs (avg_pace_min_per_km);
create index site_runs_avg_hr_idx on public.site_runs (avg_heart_rate);
create index site_runs_route_id_idx on public.site_runs (route_id);
create index site_runs_gps_coverage_idx on public.site_runs (record_distance_coverage_ratio);

create table public.site_routes (
    route_id text primary key,
    route_representative_run_id text,
    first_observed_activity_date date,
    latest_observed_activity_date date,
    run_count integer not null default 0,
    min_route_match_similarity double precision,
    avg_route_match_similarity double precision,
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
    route_h3_signature text
);

create index site_routes_rank_idx
    on public.site_routes (run_count desc, latest_observed_activity_date desc);

create table public.site_route_segments (
    run_id text not null,
    route_id text,
    activity_date date not null,
    segment_index integer not null,
    segment_distance_km double precision,
    avg_heart_rate double precision,
    segment_start_latitude_deg double precision,
    segment_start_longitude_deg double precision,
    segment_end_latitude_deg double precision,
    segment_end_longitude_deg double precision,
    primary key (run_id, segment_index)
);

create index site_route_segments_route_idx on public.site_route_segments (route_id);
create index site_route_segments_order_idx
    on public.site_route_segments (activity_date desc, run_id, segment_index);

create table public.site_days (
    calendar_date date primary key,
    run_count integer not null default 0,
    distance_km double precision not null default 0,
    duration_seconds double precision not null default 0,
    long_run_distance_km double precision not null default 0,
    active_day_flag boolean not null default false,
    rolling_7d_distance_km double precision,
    rolling_28d_distance_km double precision,
    resting_heart_rate double precision,
    hrv_value double precision,
    sleep_score double precision
);

create index site_days_calendar_date_desc_idx on public.site_days (calendar_date desc);

create table public.site_weeks (
    week_start_date date primary key,
    week_end_date date not null,
    runs_per_week integer not null default 0,
    weekly_distance_km double precision not null default 0,
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

create index site_weeks_start_date_desc_idx on public.site_weeks (week_start_date desc);

create table public.site_months (
    month_start_date date primary key,
    calendar_year integer not null,
    calendar_month integer not null,
    runs_per_month integer not null default 0,
    monthly_distance_km double precision not null default 0,
    monthly_duration_seconds double precision not null default 0,
    long_run_distance_km double precision,
    active_days integer not null default 0
);

create index site_months_start_date_desc_idx on public.site_months (month_start_date desc);

create table public.site_years (
    year_start_date date primary key,
    calendar_year integer not null,
    runs_per_year integer not null default 0,
    yearly_distance_km double precision not null default 0,
    yearly_duration_seconds double precision not null default 0,
    long_run_distance_km double precision,
    active_days integer not null default 0
);

create index site_years_start_date_desc_idx on public.site_years (year_start_date desc);

create table public.site_fitness (
    activity_id text primary key,
    activity_date date not null,
    distance_km double precision,
    avg_pace_min_per_km double precision,
    speed_kmh double precision,
    avg_heart_rate double precision,
    efficiency_ratio double precision,
    rolling_4_run_efficiency_ratio double precision,
    hr_drift_pct double precision,
    rolling_4_run_hr_drift_pct double precision,
    hr_band text,
    garmin_recovery_hr double precision,
    resting_heart_rate double precision,
    hrv_value double precision,
    hrv_status text,
    sleep_score double precision,
    sleep_duration_seconds double precision
);

create index site_fitness_activity_date_desc_idx
    on public.site_fitness (activity_date desc, activity_id desc);

create table public.site_dashboard_summary (
    summary_key text primary key default 'current',
    latest_completed_date date,
    total_runs integer not null default 0,
    total_distance_km double precision not null default 0,
    recent_7d_distance_km double precision not null default 0,
    recent_28d_distance_km double precision not null default 0,
    active_weeks integer not null default 0,
    active_months integer not null default 0,
    hrv_days integer not null default 0,
    rhr_days integer not null default 0,
    sleep_days integer not null default 0,
    heart_rate_days integer not null default 0,
    constraint site_dashboard_summary_single_row check (summary_key = 'current')
);

create table public.site_metadata (
    metadata_key text primary key,
    metadata_value jsonb not null,
    updated_at timestamp with time zone not null default now()
);

alter table public.site_runs enable row level security;
alter table public.site_routes enable row level security;
alter table public.site_route_segments enable row level security;
alter table public.site_days enable row level security;
alter table public.site_weeks enable row level security;
alter table public.site_months enable row level security;
alter table public.site_years enable row level security;
alter table public.site_fitness enable row level security;
alter table public.site_dashboard_summary enable row level security;
alter table public.site_metadata enable row level security;

create policy "Allow public read"
    on public.site_runs for select
    to anon, authenticated
    using (true);

create policy "Allow public read"
    on public.site_routes for select
    to anon, authenticated
    using (true);

create policy "Allow public read"
    on public.site_route_segments for select
    to anon, authenticated
    using (true);

create policy "Allow public read"
    on public.site_days for select
    to anon, authenticated
    using (true);

create policy "Allow public read"
    on public.site_weeks for select
    to anon, authenticated
    using (true);

create policy "Allow public read"
    on public.site_months for select
    to anon, authenticated
    using (true);

create policy "Allow public read"
    on public.site_years for select
    to anon, authenticated
    using (true);

create policy "Allow public read"
    on public.site_fitness for select
    to anon, authenticated
    using (true);

create policy "Allow public read"
    on public.site_dashboard_summary for select
    to anon, authenticated
    using (true);

create policy "Allow public read"
    on public.site_metadata for select
    to anon, authenticated
    using (true);

grant usage on schema public to anon, authenticated;
grant select on public.site_runs to anon, authenticated;
grant select on public.site_routes to anon, authenticated;
grant select on public.site_route_segments to anon, authenticated;
grant select on public.site_days to anon, authenticated;
grant select on public.site_weeks to anon, authenticated;
grant select on public.site_months to anon, authenticated;
grant select on public.site_years to anon, authenticated;
grant select on public.site_fitness to anon, authenticated;
grant select on public.site_dashboard_summary to anon, authenticated;
grant select on public.site_metadata to anon, authenticated;
