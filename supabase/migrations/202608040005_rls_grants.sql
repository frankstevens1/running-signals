alter table public.site_runs_core enable row level security;
alter table public.site_days_core enable row level security;
alter table public.site_fitness_core enable row level security;
alter table public.site_dashboard_summary_core enable row level security;
alter table public.site_routes enable row level security;
alter table public.site_route_segments enable row level security;
alter table public.site_weeks enable row level security;
alter table public.site_map_profile_records enable row level security;
alter table public.site_metadata enable row level security;

create policy "Allow public read" on public.site_runs_core
    for select to anon, authenticated using (true);
create policy "Allow public read" on public.site_days_core
    for select to anon, authenticated using (true);
create policy "Allow public read" on public.site_fitness_core
    for select to anon, authenticated using (true);
create policy "Allow public read" on public.site_dashboard_summary_core
    for select to anon, authenticated using (true);
create policy "Allow public read" on public.site_routes
    for select to anon, authenticated using (true);
create policy "Allow public read" on public.site_route_segments
    for select to anon, authenticated using (true);
create policy "Allow public read" on public.site_weeks
    for select to anon, authenticated using (true);
create policy "Allow public read" on public.site_map_profile_records
    for select to anon, authenticated using (true);
create policy "Allow public read" on public.site_metadata
    for select to anon, authenticated using (true);

grant usage on schema public to anon, authenticated;

grant select on public.site_runs_core, public.site_days_core,
    public.site_fitness_core, public.site_dashboard_summary_core,
    public.site_routes, public.site_route_segments, public.site_weeks,
    public.site_map_profile_records, public.site_metadata
    to anon, authenticated;

grant select on public.site_runs, public.site_days, public.site_fitness,
    public.site_dashboard_summary
    to anon, authenticated;

grant execute on function public.site_run_filter_bounds_for_window(date, date),
    public.site_route_summaries(date, date, integer, integer),
    public.site_period_summary(date, date),
    public.site_map_profile_records(text, text)
    to anon, authenticated;
