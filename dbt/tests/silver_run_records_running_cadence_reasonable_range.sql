select *
from {{ ref('silver_run_records') }}
where running_cadence is not null
    and (
        running_cadence < 0
        or running_cadence > 300
    )
