alter table public.site_runs_core
    add column if not exists distance_economy_m_per_beat double precision,
    add column if not exists elevation_economy_m_per_beat double precision,
    add column if not exists personal_efficiency_score double precision;
