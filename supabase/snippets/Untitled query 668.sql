alter table public.site_routes
add column if not exists route_start_latitude_deg double precision,
add column if not exists route_start_longitude_deg double precision,
add column if not exists city_name text,
add column if not exists country_name text,
add column if not exists country_code text;