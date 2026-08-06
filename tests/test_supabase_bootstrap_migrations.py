from pathlib import Path


MIGRATIONS_DIR = Path(__file__).parents[1] / "supabase/migrations"
MIGRATION_NAMES = [
    "202608040001_core_tables.sql",
    "202608040002_secondary_indexes.sql",
    "202608040003_public_views.sql",
    "202608040004_public_rpcs.sql",
    "202608040005_rls_grants.sql",
    "202608040006_postgrest_reload.sql",
    "202608040007_sqlearn_reader.sql",
    "202608040008_route_country_iso3.sql",
    "202608060001_run_fitness_view.sql",
    "202608060002_aerobic_decoupling_gate_evidence.sql",
    "202608060003_metric_trends.sql",
    "202608060004_live_drift_trace.sql",
]


def migration(name: str) -> str:
    return (MIGRATIONS_DIR / name).read_text()


def test_bootstrap_migrations_are_the_complete_fresh_database_sequence() -> None:
    assert sorted(path.name for path in MIGRATIONS_DIR.glob("*.sql")) == MIGRATION_NAMES


def test_core_tables_match_the_final_serving_contract() -> None:
    core = migration("202608040001_core_tables.sql")

    for table in (
        "site_runs_core",
        "site_days_core",
        "site_fitness_core",
        "site_dashboard_summary_core",
        "site_routes",
        "site_route_segments",
        "site_weeks",
        "site_map_profile_records",
        "site_metadata",
    ):
        assert f"create table public.{table}" in core

    assert "aerobic_decoupling_pct" in core
    assert "hr_drift_pct" not in core
    assert "site_activity_records" not in core
    assert "site_health_days" not in core
    assert "primary key (run_id, unit_system, segment_length_value, segment_index)" in core
    assert "country_iso3 text" in core


def test_views_rpcs_and_access_controls_follow_dependency_order() -> None:
    views = migration("202608040003_public_views.sql")
    rpcs = migration("202608040004_public_rpcs.sql")
    access = migration("202608040005_rls_grants.sql")

    assert views.count("with (security_invoker = true)") == 4
    assert "create function public.site_map_profile_records" in rpcs
    assert "create function public.site_run_filter_bounds_for_window" in rpcs
    assert "create function public.site_route_summaries" in rpcs
    assert "create function public.site_period_summary" in rpcs
    assert rpcs.count("security invoker") == 4
    assert rpcs.count("set search_path = public") == 4
    assert "grant usage on schema public to anon, authenticated" in access
    assert "public.site_map_profile_records(text, text)" in access


def test_route_country_iso3_migration_updates_the_rpc_contract() -> None:
    migration_sql = migration("202608040008_route_country_iso3.sql")

    assert "add column if not exists country_iso3 text" in migration_sql
    assert "drop function if exists public.site_route_summaries" in migration_sql
    assert "country_iso3 text" in migration_sql
    assert "routes.country_iso3" in migration_sql


def test_aerobic_decoupling_gate_evidence_extends_fitness_and_run_views() -> None:
    migration_sql = migration("202608060002_aerobic_decoupling_gate_evidence.sql")

    assert "add column aerobic_decoupling_failed_gates jsonb" in migration_sql
    assert migration_sql.count("create or replace view public.site_") == 2
    assert migration_sql.count("fitness.aerobic_decoupling_failed_gates") == 2


def test_metric_trends_extend_fitness_and_run_views() -> None:
    migration_sql = migration("202608060003_metric_trends.sql")

    assert migration_sql.count("add column previous_") == 4
    assert migration_sql.count("fitness.previous_") == 8


def test_live_drift_trace_extends_fitness_and_run_views() -> None:
    migration_sql = migration("202608060004_live_drift_trace.sql")

    assert "add column live_drift_trace jsonb" in migration_sql
    assert migration_sql.count("fitness.live_drift_trace") == 2


def test_sqlearn_reader_is_limited_to_dedicated_security_barrier_views() -> None:
    sqlearn_reader = migration("202608040007_sqlearn_reader.sql")

    assert "create role sqlearn_reader nologin noinherit" in sqlearn_reader
    assert "create schema if not exists sqlearn authorization postgres" in sqlearn_reader
    assert sqlearn_reader.count("with (security_barrier = true)") == 6
    assert "grant select on all tables in schema sqlearn to sqlearn_reader" in sqlearn_reader
    assert "revoke all on all tables in schema public from sqlearn_reader" in sqlearn_reader
    assert "default_transaction_read_only = on" in sqlearn_reader
