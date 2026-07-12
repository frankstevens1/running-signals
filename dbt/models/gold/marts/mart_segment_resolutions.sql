{{ config(materialized='table') }}

select
    'metric' as unit_system,
    cast(0.25 as decimal(4, 2)) as segment_length_value,
    cast(250.000 as decimal(10, 3)) as segment_length_m,
    '250 m' as segment_length_label,
    true as is_canonical

union all

select
    'metric',
    cast(0.50 as decimal(4, 2)),
    cast(500.000 as decimal(10, 3)),
    '500 m',
    false

union all

select
    'metric',
    cast(1.00 as decimal(4, 2)),
    cast(1000.000 as decimal(10, 3)),
    '1 km',
    false

union all

select
    'imperial',
    cast(0.25 as decimal(4, 2)),
    cast(402.336 as decimal(10, 3)),
    '0.25 mi',
    false

union all

select
    'imperial',
    cast(0.50 as decimal(4, 2)),
    cast(804.672 as decimal(10, 3)),
    '0.5 mi',
    false

union all

select
    'imperial',
    cast(1.00 as decimal(4, 2)),
    cast(1609.344 as decimal(10, 3)),
    '1 mi',
    false
