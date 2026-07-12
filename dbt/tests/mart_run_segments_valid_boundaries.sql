select *
from {{ ref('mart_run_segments') }}
where segment_index < 1
    or abs(segment_start_boundary_m - ((segment_index - 1) * segment_length_m)) > 0.001
    or abs(segment_end_boundary_m - (segment_index * segment_length_m)) > 0.001
    or segment_end_boundary_m <= segment_start_boundary_m
    or abs(segment_start_distance_m - segment_start_boundary_m) > 0.001
    or segment_end_distance_m > segment_end_boundary_m + 0.001
    or segment_end_distance_m < segment_start_distance_m
    or segment_distance_m < 0
    or abs(
        segment_distance_m - (segment_end_distance_m - segment_start_distance_m)
    ) > 0.001
    or segment_duration_seconds < 0
