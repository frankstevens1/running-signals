select
    profiles.run_id,
    profiles.record_index
from {{ ref('mart_map_profile_records') }} as profiles
left join {{ ref('mart_activity_records') }} as records
    on profiles.run_id = records.run_id
    and profiles.record_index = records.record_index
where records.run_id is null
