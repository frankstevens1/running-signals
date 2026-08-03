from pathlib import Path


def test_map_profile_records_rpc_uses_final_representative_run_lookup() -> None:
    migration = (
        Path(__file__).parents[1]
        / "supabase/migrations/202608040004_public_rpcs.sql"
    ).read_text()

    assert "route_representative_run_id" in migration
    assert "Pass exactly one of p_run_id or p_route_id" in migration
    assert "from public.site_map_profile_records as records" in migration
    assert "where records.run_id = target_run_id" in migration
    assert "order by records.record_index" in migration
