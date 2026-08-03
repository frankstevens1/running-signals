create view public.site_runs
with (security_invoker = true)
as
select *
from public.site_runs_core;

create view public.site_days
with (security_invoker = true)
as
select *
from public.site_days_core;

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
    fitness.aerobic_decoupling_pct,
    fitness.aerobic_decoupling_status,
    fitness.aerobic_decoupling_unavailable_reason,
    fitness.aerobic_decoupling_moving_duration_seconds,
    fitness.aerobic_decoupling_valid_segment_count,
    fitness.aerobic_decoupling_hr_coverage_ratio,
    fitness.aerobic_decoupling_maximum_hr_gap_seconds,
    fitness.first_half_speed_kmh,
    fitness.second_half_speed_kmh,
    fitness.first_half_avg_heart_rate,
    fitness.second_half_avg_heart_rate,
    fitness.first_half_efficiency_ratio,
    fitness.second_half_efficiency_ratio,
    fitness.aerobic_decoupling_prior_90d_count,
    fitness.aerobic_decoupling_prior_90d_median,
    fitness.aerobic_decoupling_prior_90d_q1,
    fitness.aerobic_decoupling_prior_90d_q3,
    fitness.hr_band,
    fitness.garmin_recovery_hr,
    fitness.rolling_4_run_recovery_hr,
    fitness.ending_heart_rate,
    fitness.recovery_prior_90d_count,
    fitness.recovery_prior_90d_median,
    fitness.recovery_prior_90d_q1,
    fitness.recovery_prior_90d_q3,
    fitness.recovery_prior_90d_min,
    fitness.recovery_prior_90d_max,
    fitness.distance_economy_m_per_beat,
    fitness.elevation_economy_m_per_beat,
    fitness.personal_efficiency_score
from public.site_fitness_core as fitness;

create view public.site_dashboard_summary
with (security_invoker = true)
as
select *
from public.site_dashboard_summary_core;
