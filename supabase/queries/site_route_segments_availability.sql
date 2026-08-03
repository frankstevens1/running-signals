select
    column_name
from information_schema.columns
where table_schema = 'public'
    and table_name = 'site_route_segments'
    and column_name in (
        'segment_distance_km',
        'segment_duration_seconds',
        'segment_pace_min_per_km',
        'avg_heart_rate',
        'max_heart_rate',
        'avg_running_cadence',
        'elevation_change_m',
        'segment_grade',
        'segment_start_distance_km',
        'segment_end_distance_km',
        'unit_system',
        'segment_length_value',
        'segment_index'
    )
order by column_name;

select
    unit_system,
    segment_length_value,
    count(distinct run_id) as runs,
    count(*) as segment_rows,
    count(segment_duration_seconds) as segments_with_duration,
    count(segment_pace_min_per_km) as segments_with_pace,
    count(avg_heart_rate) as segments_with_avg_hr,
    count(max_heart_rate) as segments_with_max_hr,
    count(avg_running_cadence) as segments_with_cadence,
    count(elevation_change_m) as segments_with_elevation_change,
    count(segment_grade) as segments_with_grade
from public.site_route_segments
group by unit_system, segment_length_value
order by unit_system, segment_length_value;
