select
    column_name
from information_schema.columns
where table_schema = 'public'
    and table_name = 'site_route_segments'
    and column_name in (
        'segment_duration_seconds',
        'segment_pace_min_per_km',
        'avg_speed_kmh',
        'max_heart_rate',
        'avg_running_cadence',
        'min_altitude_m',
        'max_altitude_m',
        'elevation_change_m',
        'segment_grade',
        'unit_system',
        'segment_length_value',
        'segment_length_m',
        'segment_length_label',
        'is_canonical',
        'segment_start_boundary_m',
        'segment_end_boundary_m',
        'segment_start_distance_m',
        'segment_end_distance_m',
        'segment_distance_m',
        'segment_distance_value',
        'segment_start_distance_km',
        'segment_end_distance_km'
    )
order by column_name;

select
    unit_system,
    segment_length_value,
    max(segment_length_label) as segment_length_label,
    max(segment_length_m) as segment_length_m,
    bool_or(is_canonical) as is_canonical,
    count(distinct run_id) as runs,
    count(*) as segment_rows,
    count(segment_duration_seconds) as segments_with_duration,
    count(segment_pace_min_per_km) as segments_with_pace,
    count(avg_speed_kmh) as segments_with_speed,
    count(avg_heart_rate) as segments_with_avg_hr,
    count(max_heart_rate) as segments_with_max_hr,
    count(avg_running_cadence) as segments_with_cadence,
    count(min_altitude_m) as segments_with_min_altitude,
    count(max_altitude_m) as segments_with_max_altitude,
    count(elevation_change_m) as segments_with_elevation_change,
    count(segment_grade) as segments_with_grade
from public.site_route_segments
group by unit_system, segment_length_value
order by unit_system, segment_length_value;

select
    date_trunc('month', activity_date::date)::date as activity_month,
    unit_system,
    segment_length_value,
    count(*) as segment_rows,
    count(segment_pace_min_per_km) as segments_with_pace,
    count(avg_heart_rate) as segments_with_avg_hr,
    count(avg_running_cadence) as segments_with_cadence,
    count(elevation_change_m) as segments_with_elevation_change,
    count(segment_grade) as segments_with_grade
from public.site_route_segments
group by
    date_trunc('month', activity_date::date)::date,
    unit_system,
    segment_length_value
order by activity_month, unit_system, segment_length_value;
