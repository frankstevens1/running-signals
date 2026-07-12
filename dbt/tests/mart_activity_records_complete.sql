with silver_counts as (
    select
        run_id,
        count(*) as record_count
    from {{ ref('silver_run_records') }}
    group by run_id
),

gold_counts as (
    select
        run_id,
        count(*) as record_count
    from {{ ref('mart_activity_records') }}
    group by run_id
)

select
    coalesce(silver_counts.run_id, gold_counts.run_id) as run_id,
    silver_counts.record_count as silver_record_count,
    gold_counts.record_count as gold_record_count
from silver_counts
full outer join gold_counts
    on silver_counts.run_id = gold_counts.run_id
where silver_counts.record_count is null
    or gold_counts.record_count is null
    or silver_counts.record_count != gold_counts.record_count
