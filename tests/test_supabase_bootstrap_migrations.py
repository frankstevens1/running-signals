from pathlib import Path


MIGRATIONS_DIR = Path(__file__).parents[1] / "supabase/migrations"
MIGRATION_NAMES = [
    "202608040001_core_tables.sql",
    "202608040002_secondary_indexes.sql",
    "202608040003_public_views.sql",
    "202608040004_public_rpcs.sql",
    "202608040005_rls_grants.sql",
    "202608040006_postgrest_reload.sql",
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
