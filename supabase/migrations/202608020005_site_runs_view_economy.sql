create or replace view public.site_runs
with (security_invoker = true)
as
select * from public.site_runs_core;
