create view public.site_run_filter_bounds
with (security_invoker = true)
as
select
    min(activity_date) as min_activity_date,
    max(activity_date) as max_activity_date,
    min(distance_km) as min_distance_km,
    max(distance_km) as max_distance_km,
    min(avg_pace_min_per_km) as min_pace_min_per_km,
    max(avg_pace_min_per_km) as max_pace_min_per_km,
    min(avg_heart_rate) as min_avg_heart_rate,
    max(avg_heart_rate) as max_avg_heart_rate,
    min(record_distance_coverage_ratio) as min_gps_coverage,
    max(record_distance_coverage_ratio) as max_gps_coverage
from public.site_runs;

grant select on public.site_run_filter_bounds to anon, authenticated;
