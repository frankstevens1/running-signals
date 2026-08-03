create index site_runs_activity_date_idx
    on public.site_runs_core (activity_date desc);
create index site_runs_distance_idx on public.site_runs_core (distance_km);
create index site_runs_pace_idx on public.site_runs_core (avg_pace_min_per_km);
create index site_runs_avg_hr_idx on public.site_runs_core (avg_heart_rate);
create index site_runs_route_id_idx on public.site_runs_core (route_id);
create index site_runs_gps_coverage_idx
    on public.site_runs_core (record_distance_coverage_ratio);

create index site_routes_rank_idx
    on public.site_routes (
        run_count desc,
        latest_observed_activity_date desc nulls last,
        route_id
    );

create index site_days_calendar_date_desc_idx
    on public.site_days_core (calendar_date desc);
create index site_weeks_start_date_desc_idx
    on public.site_weeks (week_start_date desc);
create index site_fitness_activity_date_desc_idx
    on public.site_fitness_core (activity_date desc, activity_id desc);
