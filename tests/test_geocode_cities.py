from __future__ import annotations

from pathlib import Path

from pytest import MonkeyPatch

from scripts import geocode_cities


def test_geocoder_uses_first_valid_gps_point(monkeypatch: MonkeyPatch) -> None:
    statements: list[str] = []

    monkeypatch.setattr(geocode_cities, "table_exists", lambda *_: True)

    def fake_query(statement: str) -> list[dict[str, object]]:
        statements.append(statement)
        return [
            {
                "route_id": "route-1",
                "route_start_latitude_deg": 52.1,
                "route_start_longitude_deg": 4.3,
            }
        ]

    monkeypatch.setattr(geocode_cities, "query_databricks", fake_query)

    assert geocode_cities.fetch_routes_needing_geocode("catalog", "gold") == [
        ("route-1", 52.1, 4.3)
    ]

    statement = statements[0]
    assert "valid_run_start_points" in statement
    assert "from `catalog`.`gold`.`mart_map_profile_records` as records" in statement
    assert "where records.position_lat_deg between -90 and 90" in statement
    assert "min(records.record_index) as start_index" in statement


def test_mart_routes_uses_first_valid_gps_point() -> None:
    model = (
        Path(__file__).parents[1] / "dbt/models/gold/marts/mart_routes.sql"
    ).read_text()

    start_records = model.split("run_start_records as (", maxsplit=1)[1].split(
        "),\n\nrepresentative_route_start_points", maxsplit=1
    )[0]
    assert "min(record_index) as start_record_index" in start_records
    assert "where position_lat_deg between -90 and 90" in start_records
    assert "and position_long_deg between -180 and 180" in start_records
