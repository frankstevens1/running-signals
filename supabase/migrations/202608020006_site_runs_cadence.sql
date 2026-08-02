alter table public.site_runs_core
    add column if not exists avg_cadence double precision,
    add column if not exists max_cadence double precision;
