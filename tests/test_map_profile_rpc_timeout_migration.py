from pathlib import Path


def test_map_profile_records_timeout_fix_uses_representative_run_and_indexed_lookups() -> None:
    migration = (
        Path(__file__).parents[1]
        / "supabase/migrations/202607210003_fix_sampled_map_profile_rpc_timeout.sql"
    ).read_text()

    assert "site_activity_records_map_profile_idx" in migration
    assert "route_representative_run_id" in migration
    assert "cross join lateral" in migration
    assert "candidate.run_id = target_run_id" in migration
    assert "generate_series(0::bigint, 499::bigint)" in migration
