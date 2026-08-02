drop view if exists public.site_runs;
create or replace view public.site_runs
with (security_invoker = true)
as
select * from public.site_runs_core;

grant select on public.site_runs to anon, authenticated;
