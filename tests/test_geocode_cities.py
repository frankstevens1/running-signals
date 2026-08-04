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
    assert "c.country_iso3 is null" in statement


def test_country_info_maps_iso2_to_iso3_and_name(tmp_path: Path) -> None:
    (tmp_path / "countryInfo.txt").write_text(
        "NL\tNLD\t528\tNL\tNetherlands\n",
        encoding="utf-8",
    )

    assert geocode_cities.load_country_info(tmp_path) == {
        "NL": ("NLD", "Netherlands"),
    }


def test_country_info_keeps_missing_iso3_nullable(tmp_path: Path) -> None:
    (tmp_path / "countryInfo.txt").write_text(
        "XX\t\t000\tXX\tExampleland\n",
        encoding="utf-8",
    )

    assert geocode_cities.load_country_info(tmp_path) == {
        "XX": (None, "Exampleland"),
    }


def test_nearest_city_derives_iso3_from_country_info(monkeypatch: MonkeyPatch) -> None:
    monkeypatch.setattr(
        geocode_cities,
        "query_databricks",
        lambda statement: [
            {
                "city_name": "Amsterdam",
                "latitude": 52.3676,
                "longitude": 4.9041,
                "country_name": "Netherlands",
                "country_code": "NL",
                "population": 900000,
            }
        ],
    )

    assert geocode_cities.find_nearest_city(
        "catalog",
        "gold",
        52.3676,
        4.9041,
        {"NL": ("NLD", "Netherlands")},
    ) == ("Amsterdam", "Netherlands", "NL", "NLD")


def test_backfill_route_country_iso3_uses_existing_iso2_codes(monkeypatch: MonkeyPatch) -> None:
    statements: list[str] = []

    class FakeConnection:
        def close(self) -> None:
            pass

    monkeypatch.setattr(
        geocode_cities,
        "query_databricks",
        lambda statement: [{"country_code": "NL"}, {"country_code": "US"}],
    )
    monkeypatch.setattr(geocode_cities, "connect_databricks", lambda: FakeConnection())
    monkeypatch.setattr(
        geocode_cities,
        "execute_databricks",
        lambda connection, statement: statements.append(statement),
    )

    assert geocode_cities.backfill_route_country_iso3(
        "catalog",
        "gold",
        {"NL": ("NLD", "Netherlands"), "US": ("USA", "United States")},
    ) == 2
    assert "set country_iso3 = 'NLD'" in statements[0]
    assert "country_code = 'US'" in statements[1]


def test_route_city_names_schema_and_upsert_include_iso3(monkeypatch: MonkeyPatch) -> None:
    statements: list[str] = []

    class FakeConnection:
        def close(self) -> None:
            pass

    monkeypatch.setattr(geocode_cities, "connect_databricks", lambda: FakeConnection())
    monkeypatch.setattr(geocode_cities, "table_has_column", lambda *_: False)
    monkeypatch.setattr(
        geocode_cities,
        "execute_databricks",
        lambda connection, statement: statements.append(statement),
    )

    geocode_cities.ensure_route_city_names_table("catalog", "gold")
    geocode_cities.upsert_route_city_names(
        "catalog",
        "gold",
        [("route-1", "Amsterdam", "Netherlands", "NL", "NLD", 52.3676, 4.9041)],
    )

    assert "country_iso3 string" in statements[0]
    assert "add column country_iso3 string" in statements[1]
    assert "'NLD' as country_iso3" in statements[2]


def test_mart_routes_uses_first_valid_gps_point() -> None:
    model = (
        Path(__file__).parents[1] / "dbt/models/gold/marts/mart_routes.sql"
    ).read_text()
    geography_hook = (
        Path(__file__).parents[1] / "dbt/macros/ensure_route_city_names_country_iso3.sql"
    ).read_text()

    start_records = model.split("run_start_records as (", maxsplit=1)[1].split(
        "),\n\nrepresentative_route_start_points", maxsplit=1
    )[0]
    assert "min(record_index) as start_record_index" in start_records
    assert "where position_lat_deg between -90 and 90" in start_records
    assert "and position_long_deg between -180 and 180" in start_records
    assert "country_iso3 string" in geography_hook
    assert "cities.country_iso3" in model
