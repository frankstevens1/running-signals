select *
from {{ ref('mart_segment_resolutions') }}
where segment_length_value <= 0
    or segment_length_m <= 0
    or abs(
        segment_length_m
        - case
            when unit_system = 'metric' then segment_length_value * 1000.0
            when unit_system = 'imperial' then segment_length_value * 1609.344
        end
    ) > 0.001
    or (
        is_canonical
        and not (
            unit_system = 'metric'
            and segment_length_m = 250.000
        )
    )
    or (
        select count(*)
        from {{ ref('mart_segment_resolutions') }}
        where is_canonical
    ) != 1
