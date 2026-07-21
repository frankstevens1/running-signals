select
    column_name
from information_schema.columns
where table_schema = 'public'
    and table_name = 'site_activity_records'
    and column_name in (
        'run_id',
        'route_id',
        'is_route_representative',
        'record_timestamp',
        'record_index',
        'elapsed_seconds',
        'record_distance_m',
        'speed_mps',
        'pace_min_per_km',
        'heart_rate',
        'running_cadence',
        'altitude_m',
        'temperature',
        'position_lat_deg',
        'position_long_deg'
    )
order by column_name;

select
    count(distinct run_id) as runs,
    count(*) as activity_records,
    count(record_distance_m) as records_with_distance,
    count(heart_rate) as records_with_heart_rate,
    count(running_cadence) as records_with_cadence,
    count(altitude_m) as records_with_altitude,
    count(*) filter (
        where position_lat_deg between -90 and 90
            and position_long_deg between -180 and 180
    ) as records_with_valid_gps
from public.site_activity_records;

select
    date_trunc('month', activity_date)::date as activity_month,
    count(distinct run_id) as runs,
    count(*) as activity_records,
    count(*) filter (
        where position_lat_deg between -90 and 90
            and position_long_deg between -180 and 180
    ) as records_with_valid_gps
from public.site_activity_records
group by date_trunc('month', activity_date)::date
order by activity_month;

select
    routes.route_id,
    routes.route_representative_run_id,
    count(records.record_index) as representative_records,
    count(*) filter (
        where records.position_lat_deg between -90 and 90
            and records.position_long_deg between -180 and 180
    ) as representative_records_with_valid_gps
from public.site_routes as routes
left join public.site_activity_records as records
    on routes.route_id = records.route_id
    and records.is_route_representative
group by routes.route_id, routes.route_representative_run_id
order by routes.route_id;
