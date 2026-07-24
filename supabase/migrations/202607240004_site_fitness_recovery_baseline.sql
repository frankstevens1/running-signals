alter table public.site_fitness_core
    add column if not exists ending_heart_rate double precision,
    add column if not exists recovery_prior_90d_count integer,
    add column if not exists recovery_prior_90d_median double precision,
    add column if not exists recovery_prior_90d_q1 double precision,
    add column if not exists recovery_prior_90d_q3 double precision;

create or replace view public.site_fitness
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
    fitness.rolling_4_run_recovery_hr,
    fitness.rolling_4_week_recovery_hr,
    fitness.ending_heart_rate,
    fitness.recovery_prior_90d_count,
    fitness.recovery_prior_90d_median,
    fitness.recovery_prior_90d_q1,
    fitness.recovery_prior_90d_q3
from public.site_fitness_core as fitness;
