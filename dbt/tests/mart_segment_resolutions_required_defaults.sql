with required_resolutions as (
    select 'metric' as unit_system, cast(0.25 as decimal(4, 2)) as segment_length_value
    union all
    select 'metric', cast(0.50 as decimal(4, 2))
    union all
    select 'metric', cast(1.00 as decimal(4, 2))
    union all
    select 'imperial', cast(0.25 as decimal(4, 2))
    union all
    select 'imperial', cast(0.50 as decimal(4, 2))
    union all
    select 'imperial', cast(1.00 as decimal(4, 2))
)

select required_resolutions.*
from required_resolutions
left anti join {{ ref('mart_segment_resolutions') }} as configured_resolutions
    on required_resolutions.unit_system = configured_resolutions.unit_system
        and required_resolutions.segment_length_value
            = configured_resolutions.segment_length_value
