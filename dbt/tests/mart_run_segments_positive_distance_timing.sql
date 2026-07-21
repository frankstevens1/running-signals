select *
from {{ ref('mart_run_segments') }}
where segment_distance_km > 0
    and segment_pace_min_per_km is null
