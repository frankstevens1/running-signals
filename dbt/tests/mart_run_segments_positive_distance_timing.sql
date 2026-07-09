select *
from {{ ref('mart_run_segments') }}
where segment_distance_km > 0
    and segment_start_timestamp is not null
    and segment_end_timestamp is not null
    and (
        segment_duration_seconds is null
        or segment_pace_min_per_km is null
    )
