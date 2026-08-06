select *
from {{ ref('mart_run_aerobic_decoupling') }}
where (
    aerobic_decoupling_status = 'eligible'
    and (
        aerobic_decoupling_pct is null
        or aerobic_decoupling_unavailable_reason is not null
        or coalesce(aerobic_decoupling_failed_gates, '[]') != '[]'
        or timer_running_duration_seconds < 1200
        or timer_running_distance_m < 5000
        or valid_segment_count < 8
        or hr_coverage_ratio < 0.8
        or maximum_hr_gap_seconds > 30
        or abs(first_half_distance_m - second_half_distance_m) > 0.001
        or abs(
            first_half_speed_kmh
            - first_half_distance_m / first_half_timer_running_duration_seconds * 3.6
        ) > 0.000001
        or abs(
            second_half_speed_kmh
            - second_half_distance_m / second_half_timer_running_duration_seconds * 3.6
        ) > 0.000001
        or abs(
            aerobic_decoupling_pct
            - (first_half_efficiency_ratio / second_half_efficiency_ratio - 1)
        ) > 0.000001
    )
)
or (
    aerobic_decoupling_status = 'ineligible'
    and (
        aerobic_decoupling_pct is not null
        or aerobic_decoupling_unavailable_reason is null
        or aerobic_decoupling_failed_gates is null
        or aerobic_decoupling_failed_gates = '[]'
    )
)
or aerobic_decoupling_status not in ('eligible', 'ineligible')
