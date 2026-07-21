with ordered_records as (
    select
        run_id,
        record_index,
        record_timestamp,
        lag(record_index) over (
            partition by run_id
            order by record_index
        ) as previous_record_index,
        lag(record_timestamp) over (
            partition by run_id
            order by record_index
        ) as previous_record_timestamp
    from {{ ref('mart_activity_records') }}
)

select *
from ordered_records
where record_index < 1
    or (previous_record_index is null and record_index != 1)
    or (previous_record_index is not null and record_index != previous_record_index + 1)
    or record_timestamp < previous_record_timestamp
