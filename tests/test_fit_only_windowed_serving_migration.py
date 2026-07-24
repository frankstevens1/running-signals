from pathlib import Path


MIGRATION = (
    Path(__file__).parents[1]
    / "supabase/migrations/202607240001_fit_only_windowed_serving.sql"
).read_text()


def test_migration_removes_health_and_unused_rollup_serving() -> None:
    assert "drop table if exists public.site_health_days" in MIGRATION
    assert "drop table if exists public.site_months" in MIGRATION
    assert "drop table if exists public.site_years" in MIGRATION
    assert "left join public.site_health_days" not in MIGRATION
    assert "garmin_recovery_hr" not in MIGRATION
    assert "metadata_key like 'fit\\_%'" not in MIGRATION
    assert "metadata_key like 'health\\_%'" in MIGRATION


def test_migration_narrows_routes_and_segments() -> None:
    for column in (
        "min_route_match_similarity",
        "avg_route_match_similarity",
        "route_h3_signature",
        "segment_start_distance_m",
        "segment_end_distance_m",
        "segment_distance_m",
        "segment_distance_value",
    ):
        assert f"drop column if exists {column}" in MIGRATION

    for index in (
        "site_route_segments_route_idx",
        "site_route_segments_order_idx",
        "site_route_segments_route_resolution_idx",
    ):
        assert f"drop index if exists public.{index}" in MIGRATION

    assert "drop constraint if exists site_route_segments_unit_system_check" not in MIGRATION
    assert "drop constraint if exists site_route_segments_pkey" not in MIGRATION


def test_migration_adds_window_rpcs_and_stable_route_order() -> None:
    for function_name in (
        "site_run_filter_bounds_for_window",
        "site_route_summaries",
        "site_period_summary",
    ):
        assert f"function public.{function_name}" in MIGRATION

    assert "count(*) over () as total_count" in MIGRATION
    assert "latest_observed_activity_date desc nulls last" in MIGRATION
    assert "route_id\n    limit" in MIGRATION


def test_migration_uses_monday_start_weeks() -> None:
    assert (
        "date_trunc('week', days.calendar_date + interval '1 day') - interval '1 day'"
        in MIGRATION
    )
