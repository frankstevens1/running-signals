with silver_keys as (
    select run_id, record_index
    from {{ ref('run_records') }}
),

gold_keys as (
    select run_id, record_index
    from {{ ref('mart_activity_records') }}
)

select
    coalesce(silver_keys.run_id, gold_keys.run_id) as run_id,
    coalesce(silver_keys.record_index, gold_keys.record_index) as record_index
from silver_keys
full outer join gold_keys
    on silver_keys.run_id = gold_keys.run_id
        and silver_keys.record_index = gold_keys.record_index
where silver_keys.run_id is null
    or gold_keys.run_id is null
