select *
from {{ ref('mart_fitness') }}
where recovery_prior_90d_count < 4
    and (
        recovery_prior_90d_median is not null
        or recovery_prior_90d_q1 is not null
        or recovery_prior_90d_q3 is not null
        or recovery_prior_90d_min is not null
        or recovery_prior_90d_max is not null
    )
