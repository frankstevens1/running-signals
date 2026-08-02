#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
import io
import math
import os
import sys
import time
import urllib.request
import zipfile
from pathlib import Path
from typing import Any, cast

from databricks import sql as databricks_sql
from databricks.sql.client import Connection as DatabricksConnection
from dotenv import load_dotenv

DATABRICKS_QUERY_ATTEMPTS = 3
DATABRICKS_INSERT_BATCH_SIZE = 2_000
GEONAMES_CITIES_URL = "https://download.geonames.org/export/dump/cities1000.zip"
GEONAMES_COUNTRIES_URL = "https://download.geonames.org/export/dump/countryInfo.txt"
EARTH_RADIUS_KM = 6371.0
GEOCODE_BBOX_LAT_DELTA = 0.5
GEOCODE_BBOX_LON_DELTA = 0.7


def get_project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def get_cache_dir() -> Path:
    cache = Path.home() / ".cache" / "running-signals" / "geonames"
    cache.mkdir(parents=True, exist_ok=True)
    return cache


def load_project_env() -> None:
    load_dotenv(get_project_root() / ".env")


def required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def clean_host(host: str) -> str:
    return host.removeprefix("https://").removeprefix("http://").rstrip("/")


def quote_identifier(value: str) -> str:
    return f"`{value.replace('`', '``')}`"


def gold_table(catalog: str, schema: str, table_name: str) -> str:
    return ".".join(
        [
            quote_identifier(catalog),
            quote_identifier(schema),
            quote_identifier(table_name),
        ]
    )


def connect_databricks() -> DatabricksConnection:
    host = clean_host(required_env("DATABRICKS_HOST"))
    http_path = required_env("DATABRICKS_HTTP_PATH")
    token = required_env("DATABRICKS_TOKEN")
    catalog = required_env("DATABRICKS_CATALOG")
    schema = required_env("DATABRICKS_GOLD_SCHEMA")

    return databricks_sql.connect(
        server_hostname=host,
        http_path=http_path,
        access_token=token,
        catalog=catalog,
        schema=schema,
    )


def execute_databricks(connection: DatabricksConnection, statement: str) -> None:
    with connection.cursor() as cursor:
        cursor_any = cast(Any, cursor)
        cursor_any.execute_async(statement)
        deadline = time.monotonic() + 300.0
        while bool(cursor_any.is_query_pending()):
            if time.monotonic() >= deadline:
                try:
                    cursor.cancel()
                except Exception:
                    pass
                raise TimeoutError("Databricks SQL statement timed out after 300 seconds.")
            time.sleep(1.0)
        cursor_any.get_async_execution_result()


def query_databricks(statement: str) -> list[dict[str, object | None]]:
    last_error: Exception | None = None
    for attempt in range(1, DATABRICKS_QUERY_ATTEMPTS + 1):
        connection = connect_databricks()
        try:
            with connection.cursor() as cursor:
                cursor.execute(statement)
                columns = [col[0] for col in cursor.description] if cursor.description else []
                rows = cursor.fetchall()
                return [dict(zip(columns, row)) for row in rows]
        except Exception as exc:
            last_error = exc
            if attempt == DATABRICKS_QUERY_ATTEMPTS:
                break
            time.sleep(float(attempt))
        finally:
            connection.close()

    assert last_error is not None
    raise RuntimeError(
        f"Databricks query failed after {DATABRICKS_QUERY_ATTEMPTS} attempts: {last_error}"
    ) from last_error


def escape_sql_string(value: str) -> str:
    return f"'{value.replace(chr(39), chr(39) + chr(39))}'"


def table_exists(catalog: str, schema: str, table_name: str) -> bool:
    try:
        result = query_databricks(
            f"select count(*) as cnt from {gold_table(catalog, schema, table_name)} limit 1"
        )
        return True
    except Exception:
        return False


def table_row_count(catalog: str, schema: str, table_name: str) -> int:
    try:
        rows = query_databricks(
            f"select count(*) as cnt from {gold_table(catalog, schema, table_name)}"
        )
        return int(rows[0]["cnt"]) if rows else 0
    except Exception:
        return 0


def download_file(url: str, dest: Path) -> None:
    if dest.exists():
        return
    print(f"  downloading {url} ...")
    tmp = dest.with_suffix(dest.suffix + ".tmp")
    request = urllib.request.Request(url)
    request.add_header("User-Agent", "running-signals-geocoder/1.0")
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            data = response.read()
    except Exception as exc:
        if tmp.exists():
            tmp.unlink()
        raise RuntimeError(f"Failed to download {url}: {exc}") from exc
    tmp.write_bytes(data)
    tmp.rename(dest)


def load_country_names(cache_dir: Path) -> dict[str, str]:
    path = cache_dir / "countryInfo.txt"
    download_file(GEONAMES_COUNTRIES_URL, path)

    mapping: dict[str, str] = {}
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            if line.startswith("#"):
                continue
            fields = line.strip().split("\t")
            if len(fields) >= 5:
                iso_code = fields[0].strip().upper()
                name = fields[4].strip()
                if iso_code and name:
                    mapping[iso_code] = name
    return mapping


def parse_cities_zip(cache_dir: Path) -> list[tuple[str, float, float, str, str, int]]:
    path = cache_dir / "cities1000.zip"
    download_file(GEONAMES_CITIES_URL, path)

    country_names = load_country_names(cache_dir)
    cities: list[tuple[str, float, float, str, str, int]] = []

    with zipfile.ZipFile(path, "r") as zf:
        with zf.open("cities1000.txt") as fh:
            reader = csv.reader(io.TextIOWrapper(fh, encoding="utf-8"), delimiter="\t")
            for row in reader:
                if len(row) < 15:
                    continue
                try:
                    name = row[1].strip()
                    lat = float(row[4])
                    lon = float(row[5])
                    country_code = row[8].strip().upper()
                    population = int(row[14])
                except (ValueError, IndexError):
                    continue

                if not name or not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
                    continue

                country_name = country_names.get(country_code, country_code)
                cities.append((name, lat, lon, country_code, country_name, population))

    return cities


def load_geonames_to_databricks(catalog: str, schema: str) -> None:
    cache_dir = get_cache_dir()
    print("Loading geonames city database ...")

    cities = parse_cities_zip(cache_dir)
    print(f"  parsed {len(cities):,} cities from geonames")

    table = gold_table(catalog, schema, "city_geonames")

    connection = connect_databricks()
    try:
        execute_databricks(
            connection,
            f"""
            create table if not exists {table} (
                city_name string not null,
                latitude double not null,
                longitude double not null,
                country_code string not null,
                country_name string not null,
                population int
            )
            using delta
            """,
        )
    finally:
        connection.close()

    existing_count = table_row_count(catalog, schema, "city_geonames")
    if existing_count >= len(cities):
        print(f"  city_geonames already has {existing_count:,} rows, skipping load")
        return

    print(f"  inserting {len(cities):,} rows into city_geonames ...")
    connection = connect_databricks()
    try:
        for i in range(0, len(cities), DATABRICKS_INSERT_BATCH_SIZE):
            batch = cities[i : i + DATABRICKS_INSERT_BATCH_SIZE]
            values = []
            for (name, lat, lon, cc, cn, pop) in batch:
                values.append(
                    f"({escape_sql_string(name)}, {lat}, {lon}, "
                    f"{escape_sql_string(cc)}, {escape_sql_string(cn)}, {pop})"
                )
            execute_databricks(
                connection,
                f"insert into {table} (city_name, latitude, longitude, country_code, country_name, population) "
                f"values {','.join(values)}",
            )
            if (i + DATABRICKS_INSERT_BATCH_SIZE) % 20_000 == 0:
                print(f"    {min(i + DATABRICKS_INSERT_BATCH_SIZE, len(cities)):,} ...")
    finally:
        connection.close()

    print(f"  loaded {len(cities):,} cities into city_geonames")


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def ensure_route_city_names_table(catalog: str, schema: str) -> None:
    table = gold_table(catalog, schema, "route_city_names")
    connection = connect_databricks()
    try:
        execute_databricks(
            connection,
            f"""
            create table if not exists {table} (
                route_id string not null,
                city_name string,
                country_name string,
                country_code string,
                route_start_latitude_deg double,
                route_start_longitude_deg double
            )
            using delta
            """,
        )
    finally:
        connection.close()


def fetch_routes_needing_geocode(
    catalog: str, schema: str
) -> list[tuple[str, float, float]]:
    routes_table = gold_table(catalog, schema, "mart_routes")
    profiles_table = gold_table(catalog, schema, "mart_map_profile_records")
    cities_table = gold_table(catalog, schema, "route_city_names")

    if not table_exists(catalog, schema, "mart_routes"):
        print("  mart_routes table does not exist yet, nothing to geocode")
        return []

    if not table_exists(catalog, schema, "mart_map_profile_records"):
        print("  mart_map_profile_records table does not exist yet, nothing to geocode")
        return []

    rows = query_databricks(
        f"""
        with route_run_mapping as (
            select route_id, route_representative_run_id
            from {routes_table}
            where route_representative_run_id is not null
        ),
        run_start_points as (
            select
                records.run_id,
                min(records.record_index) as start_index
            from {profiles_table} as records
            group by records.run_id
        ),
        route_start_positions as (
            select
                mapping.route_id,
                records.position_lat_deg as route_start_latitude_deg,
                records.position_long_deg as route_start_longitude_deg
            from route_run_mapping as mapping
            inner join run_start_points as starts
                on starts.run_id = mapping.route_representative_run_id
            inner join {profiles_table} as records
                on records.run_id = starts.run_id
                and records.record_index = starts.start_index
            where records.position_lat_deg between -90 and 90
              and records.position_long_deg between -180 and 180
        )
        select
            rsp.route_id,
            rsp.route_start_latitude_deg,
            rsp.route_start_longitude_deg
        from route_start_positions as rsp
        left join {cities_table} as c on rsp.route_id = c.route_id
        where c.route_id is null
           or (
               c.route_start_latitude_deg is distinct from rsp.route_start_latitude_deg
               or c.route_start_longitude_deg is distinct from rsp.route_start_longitude_deg
           )
        """
    )

    result: list[tuple[str, float, float]] = []
    for row in rows:
        route_id = str(row["route_id"])
        lat = row["route_start_latitude_deg"]
        lon = row["route_start_longitude_deg"]
        if lat is not None and lon is not None:
            lat_f = float(lat)
            lon_f = float(lon)
            if -90 <= lat_f <= 90 and -180 <= lon_f <= 180:
                result.append((route_id, lat_f, lon_f))

    return result


def find_nearest_city(
    catalog: str, schema: str, lat: float, lon: float
) -> tuple[str, str, str] | None:
    geonames_table = gold_table(catalog, schema, "city_geonames")

    rows = query_databricks(
        f"""
        select city_name, latitude, longitude, country_name, country_code, population
        from {geonames_table}
        where latitude between {lat} - {GEOCODE_BBOX_LAT_DELTA}
                        and {lat} + {GEOCODE_BBOX_LAT_DELTA}
          and longitude between {lon} - {GEOCODE_BBOX_LON_DELTA}
                          and {lon} + {GEOCODE_BBOX_LON_DELTA}
        """
    )

    if not rows:
        return None

    best: tuple[str, str, str] | None = None
    best_dist = float("inf")
    best_pop = -1

    for row in rows:
        city_lat = float(row["latitude"])
        city_lon = float(row["longitude"])
        dist = haversine_km(lat, lon, city_lat, city_lon)
        pop = int(row["population"] or 0)

        if dist < best_dist or (abs(dist - best_dist) < 0.001 and pop > best_pop):
            best_dist = dist
            best_pop = pop
            city_name = str(row["city_name"])
            country_name = str(row["country_name"])
            country_code = str(row["country_code"])
            best = (city_name, country_name, country_code)

    return best


def upsert_route_city_names(
    catalog: str,
    schema: str,
    rows: list[tuple[str, str, str, str, float, float]],
) -> None:
    if not rows:
        return

    table = gold_table(catalog, schema, "route_city_names")
    connection = connect_databricks()
    try:
        for (route_id, city_name, country_name, country_code, lat, lon) in rows:
            execute_databricks(
                connection,
                f"""
                merge into {table} as target
                using (
                    select
                        {escape_sql_string(route_id)} as route_id,
                        {escape_sql_string(city_name)} as city_name,
                        {escape_sql_string(country_name)} as country_name,
                        {escape_sql_string(country_code)} as country_code,
                        {lat} as route_start_latitude_deg,
                        {lon} as route_start_longitude_deg
                ) as source
                on target.route_id = source.route_id
                when matched then update set *
                when not matched then insert *
                """,
            )
    finally:
        connection.close()


def geocode(catalog: str, schema: str) -> int:
    load_geonames_to_databricks(catalog, schema)
    ensure_route_city_names_table(catalog, schema)

    print("Finding routes that need geocoding ...")
    pending = fetch_routes_needing_geocode(catalog, schema)
    print(f"  {len(pending)} routes need city names")

    if not pending:
        print("All routes already have city names.")
        return 0

    print(f"Geocoding {len(pending)} routes ...")
    resolved: list[tuple[str, str, str, str, float, float]] = []
    for route_id, lat, lon in pending:
        result = find_nearest_city(catalog, schema, lat, lon)
        if result is not None:
            city_name, country_name, country_code = result
            resolved.append((route_id, city_name, country_name, country_code, lat, lon))
            print(f"  {route_id[:8]} → {city_name}, {country_name} ({country_code})")
        else:
            print(f"  {route_id[:8]} → no city found within bounding box")

    if resolved:
        upsert_route_city_names(catalog, schema, resolved)
        print(f"Geocoded {len(resolved)} routes.")
    else:
        print("No cities could be resolved.")

    return len(resolved)


def main(argv: list[str] | None = None) -> int:
    load_project_env()
    parser = argparse.ArgumentParser(
        description="Resolve city names for routes using geonames local database."
    )
    parser.parse_args(argv)

    catalog = required_env("DATABRICKS_CATALOG")
    schema = required_env("DATABRICKS_GOLD_SCHEMA")
    geocode(catalog, schema)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1)
