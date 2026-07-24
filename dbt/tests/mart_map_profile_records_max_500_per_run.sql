select
    run_id,
    count(*) as record_count
from {{ ref('mart_map_profile_records') }}
group by run_id
having count(*) > 500
