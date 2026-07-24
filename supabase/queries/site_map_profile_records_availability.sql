select
    column_name
from information_schema.columns
where table_schema = 'public'
    and table_name = 'site_map_profile_records'
    and column_name in (
        'run_id',
        'record_index',
        'record_distance_km',
        'altitude_m',
        'position_lat_deg',
        'position_long_deg'
    )
order by column_name;

select
    count(distinct run_id) as runs,
    count(*) as map_profile_records,
    count(record_distance_km) as records_with_distance,
    count(altitude_m) as records_with_altitude,
    count(*) filter (
        where position_lat_deg between -90 and 90
            and position_long_deg between -180 and 180
    ) as records_with_valid_gps
from public.site_map_profile_records;

select
    routes.route_id,
    routes.route_representative_run_id,
    count(records.record_index) as representative_records,
    count(*) filter (
        where records.position_lat_deg between -90 and 90
            and records.position_long_deg between -180 and 180
    ) as representative_records_with_valid_gps
from public.site_routes as routes
left join public.site_map_profile_records as records
    on routes.route_representative_run_id = records.run_id
group by routes.route_id, routes.route_representative_run_id
order by routes.route_id;
