from __future__ import annotations

import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from types import TracebackType
from typing import Any, Literal

import pytest
import psycopg
from databricks import sql as databricks_sql
from pytest import MonkeyPatch

from scripts import sync_site_supabase


def databricks_config() -> sync_site_supabase.DatabricksConfig:
    return sync_site_supabase.DatabricksConfig(
        host="example.databricks.com",
        token="token",
        http_path="/sql/1.0/warehouses/warehouse",
        catalog="running_signals",
        schema="gold",
    )


def test_connect_databricks_enables_compressed_parallel_cloud_fetch(
    monkeypatch: MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}
    sentinel = object()

    def fake_connect(**kwargs: object) -> object:
        captured.update(kwargs)
        return sentinel

    monkeypatch.setattr(databricks_sql, "connect", fake_connect)

    assert sync_site_supabase.connect_databricks(databricks_config()) is sentinel
    assert captured["use_cloud_fetch"] is True
    assert captured["enable_query_result_lz4_compression"] is True
    assert captured["max_download_threads"] == 4
    assert captured["http_path"] == "/sql/1.0/warehouses/warehouse"


def test_query_databricks_retries_whole_query(monkeypatch: MonkeyPatch) -> None:
    calls = 0

    @contextmanager
    def fake_stream(config: object, statement: str) -> Iterator[tuple[tuple[str, ...], Any]]:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise RuntimeError("expired cloud fetch link")
        yield ("run_id",), iter([[{"run_id": "run-1"}]])

    monkeypatch.setattr(sync_site_supabase, "stream_query_batches", fake_stream)
    monkeypatch.setattr(time, "sleep", lambda seconds: None)

    assert sync_site_supabase.query_databricks(databricks_config(), "select runs") == [
        {"run_id": "run-1"}
    ]
    assert calls == 2


def test_map_profile_export_contains_only_sampled_presentation_columns() -> None:
    export = next(
        table_export
        for table_export in sync_site_supabase.EXPORTS
        if table_export.table_name == "site_map_profile_records"
    )

    assert export.columns == (
        "run_id",
        "record_index",
        "record_distance_km",
        "altitude_m",
        "position_lat_deg",
        "position_long_deg",
    )

    statement = export.statement(databricks_config())

    assert "`running_signals`.`gold`.`mart_map_profile_records`" in statement
    assert "activity_id" not in statement
    assert "heart_rate" not in statement


def test_site_routes_export_excludes_matching_internals() -> None:
    export = next(
        table_export
        for table_export in sync_site_supabase.EXPORTS
        if table_export.table_name == "site_routes"
    )

    assert export.columns[-3:] == (
        "representative_route_centroid_latitude_deg",
        "representative_route_centroid_longitude_deg",
        "city_grid_bucket",
    )

    statement = export.statement(databricks_config())

    assert "route_representative_run_id" in export.columns
    assert "min_route_match_similarity" not in export.columns
    assert "avg_route_match_similarity" not in export.columns
    assert "route_h3_signature" not in export.columns
    assert "representative_route_centroid_latitude_deg" in statement
    assert "representative_route_centroid_longitude_deg" in statement
    assert "city_grid_bucket" in statement


def test_site_weeks_export_includes_avg_run_distance_km() -> None:
    export = next(
        table_export
        for table_export in sync_site_supabase.EXPORTS
        if table_export.table_name == "site_weeks"
    )

    assert "avg_run_distance_km" in export.columns

    statement = export.statement(databricks_config())
    assert "avg_run_distance_km" in statement


def test_publisher_exports_only_fit_serving_tables() -> None:
    export_names = {export.table_name for export in sync_site_supabase.EXPORTS}

    assert {
        "site_dashboard_summary_core",
        "site_runs_core",
        "site_days_core",
        "site_fitness_core",
    } <= export_names
    assert (
        not {
            "site_dashboard_summary",
            "site_runs",
            "site_days",
            "site_fitness",
            "site_health_days",
            "site_months",
            "site_years",
        }
        & export_names
    )


def test_fit_exports_exclude_health_columns() -> None:
    health_columns = {
        "resting_heart_rate",
        "hrv_value",
        "hrv_status",
        "sleep_score",
        "sleep_duration_seconds",
        "has_hrv_payload",
        "has_rhr_payload",
        "has_sleep_payload",
        "has_heart_rates_payload",
    }

    assert all(
        health_columns.isdisjoint(export.columns) for export in sync_site_supabase.EXPORTS
    )


def test_fit_exports_preserve_garmin_recovery_hr() -> None:
    exports = {export.table_name: export for export in sync_site_supabase.EXPORTS}

    for table_name in ("site_runs_core", "site_fitness_core"):
        export = exports[table_name]
        assert "garmin_recovery_hr" in export.columns
        assert "garmin_recovery_hr" in export.statement(databricks_config())

    fitness_export = exports["site_fitness_core"]
    assert "rolling_4_run_recovery_hr" in fitness_export.columns
    assert "rolling_4_run_recovery_hr" in fitness_export.statement(databricks_config())


def test_dashboard_summary_derives_periods_from_days_not_months() -> None:
    statement = sync_site_supabase.dashboard_summary_select(databricks_config())

    assert "mart_days" in statement
    assert "mart_months" not in statement
    assert "count(distinct date_trunc('month', calendar_date))" in statement
    assert "count(distinct date_trunc('week', calendar_date + interval '1 day') - interval '1 day')" in statement


def test_site_route_segments_export_has_only_serving_columns() -> None:
    export = next(
        table_export
        for table_export in sync_site_supabase.EXPORTS
        if table_export.table_name == "site_route_segments"
    )

    assert export.columns == (
        "run_id",
        "unit_system",
        "segment_length_value",
        "segment_index",
        "segment_distance_km",
        "segment_duration_seconds",
        "segment_pace_min_per_km",
        "avg_heart_rate",
        "max_heart_rate",
        "avg_running_cadence",
        "elevation_change_m",
        "segment_grade",
        "segment_start_distance_km",
        "segment_end_distance_km",
    )

    statement = export.statement(databricks_config())

    assert "segments.unit_system" in statement
    assert "segments.segment_length_value" in statement
    assert "segments.segment_duration_seconds" in statement
    assert "segments.segment_pace_min_per_km" in statement
    assert "segments.max_heart_rate" in statement
    assert "segments.avg_running_cadence" in statement
    assert "segments.elevation_change_m" in statement
    assert "segments.segment_grade" in statement
    assert "segment_start_distance_km" in statement
    assert "segment_end_distance_km" in statement
    assert "segments.unit_system," in statement
    assert "segments.segment_length_value," in statement
    assert "segments.segment_index" in statement
    assert "mart_run_sessions" not in statement
    assert " join " not in statement.lower()


def test_supabase_migration_uses_resolution_aware_keys_and_public_read_policy() -> None:
    migration = (
        Path(__file__).parents[1]
        / "supabase/migrations/202607120001_activity_records_and_segment_resolutions.sql"
    ).read_text()

    assert "create table public.site_activity_records" in migration
    assert "primary key (run_id, record_index)" in migration
    assert "site_activity_records_route_idx" in migration
    assert "on public.site_activity_records for select" in migration
    assert (
        "add primary key (run_id, unit_system, segment_length_value, segment_index)"
        in migration
    )


def test_route_centroid_migration_adds_nullable_site_route_coordinates() -> None:
    migration = (
        Path(__file__).parents[1] / "supabase/migrations/202607210001_route_centroids.sql"
    ).read_text()

    assert "add column representative_route_centroid_latitude_deg double precision" in migration
    assert "add column representative_route_centroid_longitude_deg double precision" in migration


def test_map_profile_records_migration_samples_in_the_database() -> None:
    migration = (
        Path(__file__).parents[1]
        / "supabase/migrations/202607210002_sampled_map_profile_records.sql"
    ).read_text()

    assert "create or replace function public.site_map_profile_records" in migration
    assert "row_number() over (order by record_index)" in migration


def test_sampled_map_profile_serving_migration_replaces_full_telemetry_table() -> None:
    migration = (
        Path(__file__).parents[1]
        / "supabase/migrations/202607230003_sampled_map_profile_serving.sql"
    ).read_text()

    assert "create table public.site_map_profile_records" in migration
    assert "primary key (run_id, record_index)" in migration
    assert "from public.site_map_profile_records as records" in migration
    assert "drop table public.site_activity_records" in migration
    assert "heart_rate" not in migration


def test_route_city_grid_bucket_migration_adds_nullable_text_column() -> None:
    migration = (
        Path(__file__).parents[1]
        / "supabase/migrations/202607220001_site_routes_city_grid_bucket.sql"
    ).read_text()

    assert "alter table public.site_routes" in migration
    assert "add column city_grid_bucket text" in migration


def test_weeks_avg_run_distance_migration_adds_nullable_column() -> None:
    migration = (
        Path(__file__).parents[1]
        / "supabase/migrations/202607220002_site_weeks_avg_run_distance_km.sql"
    ).read_text()

    assert "alter table public.site_weeks" in migration
    assert "add column avg_run_distance_km double precision" in migration


def test_fit_health_migration_preserves_api_names_with_compatibility_views() -> None:
    migration = (
        Path(__file__).parents[1]
        / "supabase/migrations/202607230002_separate_fit_health_site_models.sql"
    ).read_text()

    for name in ("site_runs", "site_days", "site_fitness", "site_dashboard_summary"):
        assert f"alter table public.{name} rename to {name}_core" in migration
        assert f"create view public.{name}" in migration

    assert "create table public.site_health_days" in migration
    assert "left join public.site_health_days as health" in migration
    assert migration.count("with (security_invoker = true)") == 4
    assert "alter table public.site_health_days enable row level security" in migration
    assert "on public.site_health_days for select" in migration
    assert "grant select on public.site_health_days to anon, authenticated" in migration
    assert "count(*) filter (where has_heart_rates_payload)::integer" in migration
    assert "where calendar_date < current_date" in migration
    assert "row_number()" not in migration
    assert "bool_or(resting_heart_rate is not null)" not in migration


def test_fingerprint_statement_wraps_export_sql_verbatim() -> None:
    wrapped = sync_site_supabase.fingerprint_statement("select run_id from runs")

    assert "count(*) as row_count" in wrapped
    assert "xxhash64(*)" in wrapped
    assert "decimal(38, 0)" in wrapped
    assert "from (select run_id from runs) as export_rows" in wrapped


def test_combined_fingerprint_statement_uses_one_branch_per_export() -> None:
    statement = sync_site_supabase.combined_fingerprint_statement(databricks_config())

    assert statement.count("count(*) as row_count") == len(sync_site_supabase.EXPORTS)
    assert statement.count("union all") == len(sync_site_supabase.EXPORTS) - 1
    assert "'site_map_profile_records' as table_name" in statement
    assert "`running_signals`.`gold`.`mart_map_profile_records`" in statement


def test_plan_sync_skips_unchanged_and_syncs_changed_tables() -> None:
    fingerprints: dict[str, sync_site_supabase.Fingerprint | None] = {
        "site_runs_core": {"row_count": 3, "hash_sum": "111"},
        "site_routes": {"row_count": 2, "hash_sum": "222"},
    }
    stored = {
        "site_runs": {"row_count": 3, "hash_sum": "111"},
        "site_routes": {"row_count": 2, "hash_sum": "999"},
    }

    changed = sync_site_supabase.plan_sync(fingerprints, stored, force_full=False)
    changed_names = {table_export.table_name for table_export in changed}

    assert "site_runs_core" not in changed_names
    assert "site_routes" in changed_names
    # Tables without a current fingerprint always sync.
    assert "site_days_core" in changed_names


def test_plan_sync_forces_failed_fingerprints_and_full_flag() -> None:
    fingerprints: dict[str, sync_site_supabase.Fingerprint | None] = {
        "site_runs_core": None,
    }

    changed = sync_site_supabase.plan_sync(fingerprints, {}, force_full=False)
    assert "site_runs_core" in {table_export.table_name for table_export in changed}

    full = sync_site_supabase.plan_sync({}, {}, force_full=True)
    assert len(full) == len(sync_site_supabase.EXPORTS)


def test_metadata_uses_public_relation_names() -> None:
    assert sync_site_supabase.metadata_table_name("site_runs_core") == "site_runs"
    assert sync_site_supabase.metadata_table_name("site_days_core") == "site_days"
    assert sync_site_supabase.metadata_table_name("site_routes") == "site_routes"


class FakeCopy:
    def __init__(self) -> None:
        self.rows: list[list[object]] = []

    def __enter__(self) -> FakeCopy:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> Literal[False]:
        return False

    def write_row(self, row: list[object]) -> None:
        self.rows.append(row)


class FakeCursor:
    def __init__(self, copy: FakeCopy | None = None) -> None:
        self.copy_obj = copy
        self.executed: list[tuple[object, object]] = []

    def __enter__(self) -> FakeCursor:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> Literal[False]:
        return False

    def copy(self, statement: object) -> FakeCopy:
        assert self.copy_obj is not None
        assert "site_runs_core" in str(statement)
        assert "from stdin" in str(statement)
        return self.copy_obj

    def execute(self, query: object, params: object = None) -> None:
        self.executed.append((query, params))

    def fetchone(self) -> None:
        return None


class FakeConnection:
    def __init__(self, copy: FakeCopy | None = None) -> None:
        self.cursor_obj = FakeCursor(copy)

    def cursor(self) -> FakeCursor:
        return self.cursor_obj


class FakeSyncConnection:
    def __init__(self) -> None:
        self.executed: list[tuple[str, object]] = []

    def __enter__(self) -> FakeSyncConnection:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> Literal[False]:
        return False

    def execute(self, query: str, params: object = None) -> FakeSyncConnection:
        self.executed.append((query, params))
        return self

    def fetchone(self) -> tuple[bool]:
        return (True,)

    def transaction(self) -> FakeSyncConnection:
        return self


def test_copy_rows_streams_batches_through_copy() -> None:
    fake_copy = FakeCopy()
    connection = FakeConnection(fake_copy)
    table_export = next(
        export
        for export in sync_site_supabase.EXPORTS
        if export.table_name == "site_runs_core"
    )
    batches: Iterator[list[sync_site_supabase.JsonRow]] = iter(
        [
            [
                {"run_id": "run-1", "activity_id": "a1"},
                {"run_id": "run-2", "activity_id": "a2"},
            ],
            [{"run_id": "run-3", "activity_id": "a3"}],
        ]
    )
    progress: list[int] = []

    loaded = sync_site_supabase.copy_rows(
        connection,  # type: ignore[arg-type]
        table_export,
        batches,
        on_rows=progress.append,
    )

    assert loaded == 3
    assert progress == [2, 3]
    assert [row[0] for row in fake_copy.rows] == ["run-1", "run-2", "run-3"]
    # Every COPY row carries the full export column list in order.
    assert all(len(row) == len(table_export.columns) for row in fake_copy.rows)


def test_stage_export_retries_with_fresh_query_before_replacing_live_table(
    monkeypatch: MonkeyPatch,
) -> None:
    export = next(
        item
        for item in sync_site_supabase.EXPORTS
        if item.table_name == "site_map_profile_records"
    )
    attempts = 0
    clears: list[str] = []

    monkeypatch.setattr(
        sync_site_supabase,
        "create_staging_table",
        lambda connection, table_export: "stage_profiles",
    )
    monkeypatch.setattr(
        sync_site_supabase,
        "clear_staging_table",
        lambda connection, stage_name: clears.append(stage_name),
    )

    @contextmanager
    def fake_stream(config: object, statement: str) -> Iterator[tuple[tuple[str, ...], Any]]:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise RuntimeError("expired result link")
        yield export.columns, iter([[{"run_id": "run-1"}, {"run_id": "run-2"}]])

    def fake_copy(
        connection: object,
        table_export: sync_site_supabase.TableExport,
        batches: Iterator[list[sync_site_supabase.JsonRow]],
        on_rows: object,
        destination_table: str | None = None,
    ) -> int:
        assert destination_table == "stage_profiles"
        return sum(len(batch) for batch in batches)

    monkeypatch.setattr(sync_site_supabase, "stream_query_batches", fake_stream)
    monkeypatch.setattr(sync_site_supabase, "copy_rows", fake_copy)
    monkeypatch.setattr(time, "sleep", lambda seconds: None)

    stage_name, loaded = sync_site_supabase.stage_export(
        object(),  # type: ignore[arg-type]
        databricks_config(),
        export,
        expected_rows=2,
        progress=sync_site_supabase.ProgressReporter(use_tty=False),
        index=1,
        changed_count=1,
    )

    assert (stage_name, loaded) == ("stage_profiles", 2)
    assert attempts == 2
    assert clears == ["stage_profiles", "stage_profiles"]


def test_upsert_metadata_uses_on_conflict() -> None:
    connection = FakeConnection()

    sync_site_supabase.upsert_metadata(
        connection,  # type: ignore[arg-type]
        "row_counts",
        {"site_runs": 3},
    )

    assert len(connection.cursor_obj.executed) == 1
    query, params = connection.cursor_obj.executed[0]
    assert "on conflict (metadata_key) do update" in str(query)
    assert params is not None and params[0] == "row_counts"  # type: ignore[index]


def test_render_progress_formats_determinate_and_indeterminate() -> None:
    assert sync_site_supabase.render_progress(50, 200) == (
        "|#####---------------| 25% 50/200 rows"
    )
    assert sync_site_supabase.render_progress(200, 200).startswith(
        "|####################| 100%"
    )
    assert sync_site_supabase.render_progress(7, None) == "7 rows"
    assert sync_site_supabase.render_progress(7, 0) == "7 rows"


def test_progress_reporter_plain_mode_prints_info_only(capsys: pytest.CaptureFixture[str]) -> None:
    reporter = sync_site_supabase.ProgressReporter(use_tty=False)

    reporter.status("transient")
    reporter.info("done")

    captured = capsys.readouterr()
    assert captured.out == "done\n"


def test_sync_supabase_stages_then_atomically_replaces_fit_exports(
    monkeypatch: MonkeyPatch,
) -> None:
    connection = FakeSyncConnection()
    exports = sync_site_supabase.EXPORTS
    fingerprints: dict[str, sync_site_supabase.Fingerprint | None] = {
        export.table_name: {"row_count": 1, "hash_sum": export.table_name} for export in exports
    }
    metadata_reads: list[str] = []
    metadata_writes: dict[str, object] = {}
    staged: list[str] = []
    replaced: list[str] = []
    locks: list[str] = []

    monkeypatch.setattr(
        psycopg,
        "connect",
        lambda url, autocommit: connection,
    )

    def fake_get_metadata_value(connection: object, key: str) -> dict[str, object]:
        metadata_reads.append(key)
        return {
            "site_months": {"row_count": 12, "hash_sum": "old-months"},
            "site_years": {"row_count": 2, "hash_sum": "old-years"},
            "site_health_days": {"row_count": 30, "hash_sum": "old-health"},
        }

    def fake_upsert_metadata(connection: object, key: str, value: object) -> None:
        metadata_writes[key] = value

    monkeypatch.setattr(sync_site_supabase, "get_metadata_value", fake_get_metadata_value)
    monkeypatch.setattr(sync_site_supabase, "upsert_metadata", fake_upsert_metadata)
    monkeypatch.setattr(
        sync_site_supabase,
        "acquire_publish_lock",
        lambda connection: locks.append("acquire"),
    )
    monkeypatch.setattr(
        sync_site_supabase,
        "release_publish_lock",
        lambda connection: locks.append("release"),
    )

    def fake_stage_export(
        connection: object,
        config: object,
        export: sync_site_supabase.TableExport,
        expected_rows: int | None,
        progress: object,
        index: int,
        changed_count: int,
    ) -> tuple[str, int]:
        staged.append(export.table_name)
        assert expected_rows == 1
        return f"stage_{export.table_name}", 1

    def fake_replace(
        connection: object,
        export: sync_site_supabase.TableExport,
        stage_name: str,
    ) -> None:
        assert stage_name == f"stage_{export.table_name}"
        replaced.append(export.table_name)

    monkeypatch.setattr(sync_site_supabase, "stage_export", fake_stage_export)
    monkeypatch.setattr(sync_site_supabase, "replace_from_staging", fake_replace)
    monkeypatch.setattr(
        sync_site_supabase,
        "query_databricks",
        lambda config, statement: [{"latest_completed_date": "2026-07-22"}],
    )

    sync_site_supabase.sync_supabase(
        "postgresql://example",
        databricks_config(),
        fingerprints,
        force_full=False,
        dry_run=False,
        progress=sync_site_supabase.ProgressReporter(use_tty=False),
    )

    assert connection.executed[0] == (
        "select set_config('statement_timeout', %s, false)",
        ("30min",),
    )
    assert (
        "select set_config('lock_timeout', %s, true)",
        ("10s",),
    ) in connection.executed
    assert locks == ["acquire", "release"]
    assert metadata_reads == ["export_fingerprints"]
    assert staged == [export.table_name for export in exports]
    assert replaced == staged
    assert {
        "generated_at",
        "latest_completed_date",
        "databricks_catalog",
        "databricks_gold_schema",
        "row_counts",
        "export_fingerprints",
    } == set(metadata_writes)
    row_counts = metadata_writes["row_counts"]
    stored_fingerprints = metadata_writes["export_fingerprints"]
    assert isinstance(row_counts, dict)
    assert isinstance(stored_fingerprints, dict)
    assert "site_runs" in row_counts
    assert "site_runs_core" not in row_counts
    assert not {"site_months", "site_years", "site_health_days"} & stored_fingerprints.keys()
    assert "site_health_days" not in replaced


def test_parse_args_rejects_group() -> None:
    assert not hasattr(sync_site_supabase.parse_args([]), "group")

    with pytest.raises(SystemExit):
        sync_site_supabase.parse_args(["--group", "health"])


def test_main_runs_fit_publisher(monkeypatch: MonkeyPatch) -> None:
    calls: list[str] = []

    monkeypatch.setattr(sync_site_supabase, "get_databricks_config", databricks_config)

    def fake_fetch_fingerprints(
        config: sync_site_supabase.DatabricksConfig,
        progress: sync_site_supabase.ProgressReporter,
    ) -> dict[str, sync_site_supabase.Fingerprint | None]:
        calls.append("fingerprint")
        return {}

    def fake_sync_supabase(
        supabase_db_url: str,
        config: sync_site_supabase.DatabricksConfig,
        fingerprints: dict[str, sync_site_supabase.Fingerprint | None],
        force_full: bool,
        dry_run: bool,
        progress: sync_site_supabase.ProgressReporter,
    ) -> None:
        calls.append("sync")

    monkeypatch.setattr(sync_site_supabase, "fetch_fingerprints", fake_fetch_fingerprints)
    monkeypatch.setattr(sync_site_supabase, "sync_supabase", fake_sync_supabase)

    assert sync_site_supabase.main(["--no-progress"]) == 0
    assert calls == ["fingerprint", "sync"]
