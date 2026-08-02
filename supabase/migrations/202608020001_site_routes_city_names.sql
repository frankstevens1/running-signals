alter table public.site_routes
    drop column city_grid_bucket,
    add column route_start_latitude_deg double precision,
    add column route_start_longitude_deg double precision,
    add column city_name text,
    add column country_name text,
    add column country_code text;
