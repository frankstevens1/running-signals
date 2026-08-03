select *
from {{ ref('mart_fitness') }}
where aerobic_decoupling_prior_90d_count < 4
    and (
        aerobic_decoupling_prior_90d_median is not null
        or aerobic_decoupling_prior_90d_q1 is not null
        or aerobic_decoupling_prior_90d_q3 is not null
    )
