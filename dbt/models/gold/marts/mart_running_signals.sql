with consistency as (
    select *
    from {{ ref('signal_consistency') }}
),

volume as (
    select *
    from {{ ref('signal_volume') }}
),

fitness as (
    select *
    from {{ ref('signal_fitness') }}
)

select
    *
from fitness

-- Temporary, later this will be a proper presentation mart.