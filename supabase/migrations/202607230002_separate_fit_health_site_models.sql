alter table public.site_runs rename to site_runs_core;
alter table public.site_days rename to site_days_core;
alter table public.site_fitness rename to site_fitness_core;
alter table public.site_dashboard_summary rename to site_dashboard_summary_core;

create table public.site_health_days (
    calendar_date date primary key,
    resting_heart_rate double precision,
    hrv_value double precision,
    hrv_status text,
    sleep_score double precision,
    sleep_duration_seconds double precision,
    has_hrv_payload boolean not null default false,
    has_rhr_payload boolean not null default false,
    has_sleep_payload boolean not null default false,
    has_heart_rates_payload boolean not null default false
);

with existing_health as (
    select
        calendar_date,
        resting_heart_rate,
        hrv_value,
        null::text as hrv_status,
        sleep_score,
        null::double precision as sleep_duration_seconds
    from public.site_days_core

    union all

    select
        activity_date as calendar_date,
        resting_heart_rate,
        hrv_value,
        hrv_status,
        sleep_score,
        sleep_duration_seconds
    from public.site_runs_core

    union all

    select
        activity_date as calendar_date,
        resting_heart_rate,
        hrv_value,
        hrv_status,
        sleep_score,
        sleep_duration_seconds
    from public.site_fitness_core
)
insert into public.site_health_days (
    calendar_date,
    resting_heart_rate,
    hrv_value,
    hrv_status,
    sleep_score,
    sleep_duration_seconds,
    has_hrv_payload,
    has_rhr_payload,
    has_sleep_payload,
    has_heart_rates_payload
)
select
    calendar_date,
    max(resting_heart_rate),
    max(hrv_value),
    max(hrv_status),
    max(sleep_score),
    max(sleep_duration_seconds),
    bool_or(hrv_value is not null or hrv_status is not null),
    false,
    bool_or(sleep_score is not null or sleep_duration_seconds is not null),
    false
from existing_health
where calendar_date < current_date
group by calendar_date;

alter table public.site_runs_core
    drop column resting_heart_rate,
    drop column hrv_value,
    drop column hrv_status,
    drop column sleep_score,
    drop column sleep_duration_seconds;

alter table public.site_days_core
    drop column resting_heart_rate,
    drop column hrv_value,
    drop column sleep_score;

alter table public.site_fitness_core
    drop column resting_heart_rate,
    drop column hrv_value,
    drop column hrv_status,
    drop column sleep_score,
    drop column sleep_duration_seconds;

alter table public.site_dashboard_summary_core
    drop column hrv_days,
    drop column rhr_days,
    drop column sleep_days,
    drop column heart_rate_days;

alter table public.site_health_days enable row level security;

create policy "Allow public read"
    on public.site_health_days for select
    to anon, authenticated
    using (true);

create view public.site_runs
with (security_invoker = true)
as
select
    runs.run_id,
    runs.activity_id,
    runs.activity_date,
    runs.start_time,
    runs.distance_km,
    runs.duration_seconds,
    runs.avg_pace_min_per_km,
    runs.speed_kmh,
    runs.avg_heart_rate,
    runs.max_heart_rate,
    runs.total_ascent,
    runs.total_descent,
    runs.garmin_recovery_hr,
    runs.route_id,
    runs.route_distance_bucket_km,
    runs.record_distance_coverage_ratio,
    runs.segment_count,
    runs.avg_segment_grade,
    runs.route_altitude_range_m,
    health.resting_heart_rate,
    health.hrv_value,
    health.hrv_status,
    health.sleep_score,
    health.sleep_duration_seconds,
    runs.prior_7d_distance_km,
    runs.prior_28d_distance_km
from public.site_runs_core as runs
left join public.site_health_days as health
    on runs.activity_date = health.calendar_date;

create view public.site_days
with (security_invoker = true)
as
select
    days.calendar_date,
    days.run_count,
    days.distance_km,
    days.duration_seconds,
    days.long_run_distance_km,
    days.active_day_flag,
    days.rolling_7d_distance_km,
    days.rolling_28d_distance_km,
    health.resting_heart_rate,
    health.hrv_value,
    health.sleep_score
from public.site_days_core as days
left join public.site_health_days as health
    on days.calendar_date = health.calendar_date;

create view public.site_fitness
with (security_invoker = true)
as
select
    fitness.activity_id,
    fitness.activity_date,
    fitness.distance_km,
    fitness.avg_pace_min_per_km,
    fitness.speed_kmh,
    fitness.avg_heart_rate,
    fitness.efficiency_ratio,
    fitness.rolling_4_run_efficiency_ratio,
    fitness.hr_drift_pct,
    fitness.rolling_4_run_hr_drift_pct,
    fitness.hr_band,
    fitness.garmin_recovery_hr,
    health.resting_heart_rate,
    health.hrv_value,
    health.hrv_status,
    health.sleep_score,
    health.sleep_duration_seconds,
    fitness.rolling_4_run_recovery_hr
from public.site_fitness_core as fitness
left join public.site_health_days as health
    on fitness.activity_date = health.calendar_date;

create view public.site_dashboard_summary
with (security_invoker = true)
as
select
    summary.summary_key,
    summary.latest_completed_date,
    summary.total_runs,
    summary.total_distance_km,
    summary.recent_7d_distance_km,
    summary.recent_28d_distance_km,
    summary.active_weeks,
    summary.active_months,
    coverage.hrv_days,
    coverage.rhr_days,
    coverage.sleep_days,
    coverage.heart_rate_days
from public.site_dashboard_summary_core as summary
cross join (
    select
        count(*) filter (where has_hrv_payload)::integer as hrv_days,
        count(*) filter (where has_rhr_payload)::integer as rhr_days,
        count(*) filter (where has_sleep_payload)::integer as sleep_days,
        count(*) filter (where has_heart_rates_payload)::integer as heart_rate_days
    from public.site_health_days
) as coverage;

grant select on public.site_health_days to anon, authenticated;
grant select on public.site_runs to anon, authenticated;
grant select on public.site_days to anon, authenticated;
grant select on public.site_fitness to anon, authenticated;
grant select on public.site_dashboard_summary to anon, authenticated;
