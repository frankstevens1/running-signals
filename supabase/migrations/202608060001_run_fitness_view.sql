create or replace view public.site_runs
with (security_invoker = true)
as
select
    runs.*,
    fitness.aerobic_decoupling_pct,
    fitness.aerobic_decoupling_status,
    fitness.aerobic_decoupling_unavailable_reason
from public.site_runs_core as runs
left join public.site_fitness_core as fitness using (activity_id);
