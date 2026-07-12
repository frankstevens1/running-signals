{{ config(materialized='table') }}

with resolutions as (
    select *
    from {{ ref('mart_segment_resolutions') }}
),

distance_records as (
    select
        *,
        greatest(
            max(record_distance_m) over (
                partition by run_id
                order by record_index
                rows between unbounded preceding and current row
            ),
            0.0
        ) as analysis_distance_m
    from {{ ref('silver_run_records') }}
    where record_distance_m is not null
),

records_with_previous as (
    select
        *,
        lag(analysis_distance_m) over (
            partition by run_id
            order by record_index
        ) as previous_analysis_distance_m,
        lag(record_timestamp) over (
            partition by run_id
            order by record_index
        ) as previous_record_timestamp,
        lag(heart_rate) over (
            partition by run_id
            order by record_index
        ) as previous_heart_rate,
        lag(running_cadence) over (
            partition by run_id
            order by record_index
        ) as previous_running_cadence,
        lag(altitude_m) over (
            partition by run_id
            order by record_index
        ) as previous_altitude_m,
        lag(position_lat_deg) over (
            partition by run_id
            order by record_index
        ) as previous_latitude_deg,
        lag(position_long_deg) over (
            partition by run_id
            order by record_index
        ) as previous_longitude_deg,
        lag(h3_cell_resolution_8) over (
            partition by run_id
            order by record_index
        ) as previous_h3_cell_resolution_8,
        lag(h3_cell_resolution_9) over (
            partition by run_id
            order by record_index
        ) as previous_h3_cell_resolution_9
    from distance_records
),

record_intervals as (
    select
        *,
        coalesce(previous_analysis_distance_m, 0.0) as interval_start_distance_m,
        analysis_distance_m as interval_end_distance_m,
        analysis_distance_m - coalesce(previous_analysis_distance_m, 0.0)
            as interval_distance_m,
        coalesce(previous_record_timestamp, record_timestamp) as interval_start_timestamp,
        record_timestamp as interval_end_timestamp,
        greatest(
            cast(
                unix_timestamp(record_timestamp)
                - unix_timestamp(coalesce(previous_record_timestamp, record_timestamp))
                as double
            ),
            0.0
        ) as interval_duration_seconds
    from records_with_previous
),

run_distance_extents as (
    select
        run_id,
        activity_id,
        activity_date,
        max(analysis_distance_m) as activity_distance_m
    from distance_records
    group by
        run_id,
        activity_id,
        activity_date
),

configured_segments as (
    select
        run_distance_extents.run_id,
        run_distance_extents.activity_id,
        run_distance_extents.activity_date,
        resolutions.unit_system,
        resolutions.segment_length_value,
        resolutions.segment_length_m,
        resolutions.segment_length_label,
        resolutions.is_canonical,
        segment_index,
        (segment_index - 1) * resolutions.segment_length_m as segment_start_boundary_m,
        segment_index * resolutions.segment_length_m as segment_end_boundary_m
    from run_distance_extents
    cross join resolutions
    lateral view explode(
        sequence(
            1,
            greatest(
                cast(ceil(activity_distance_m / resolutions.segment_length_m) as int),
                1
            )
        )
    ) exploded_segment_indexes as segment_index
),

interval_segment_matches as (
    select
        configured_segments.*,
        record_intervals.record_index,
        record_intervals.interval_start_timestamp,
        record_intervals.interval_end_timestamp,
        record_intervals.interval_start_distance_m,
        record_intervals.interval_end_distance_m,
        record_intervals.interval_distance_m,
        record_intervals.interval_duration_seconds,
        record_intervals.previous_heart_rate,
        record_intervals.heart_rate,
        record_intervals.previous_running_cadence,
        record_intervals.running_cadence,
        record_intervals.previous_altitude_m,
        record_intervals.altitude_m,
        record_intervals.previous_latitude_deg,
        record_intervals.position_lat_deg,
        record_intervals.previous_longitude_deg,
        record_intervals.position_long_deg,
        record_intervals.previous_h3_cell_resolution_8,
        record_intervals.h3_cell_resolution_8,
        record_intervals.previous_h3_cell_resolution_9,
        record_intervals.h3_cell_resolution_9
    from configured_segments
    inner join record_intervals
        on configured_segments.run_id = record_intervals.run_id
            and (
                (
                    record_intervals.interval_distance_m > 0
                    and record_intervals.interval_end_distance_m
                        > configured_segments.segment_start_boundary_m
                    and record_intervals.interval_start_distance_m
                        < configured_segments.segment_end_boundary_m
                )
                or (
                    record_intervals.interval_distance_m = 0
                    and configured_segments.segment_index = greatest(
                        cast(ceil(
                            record_intervals.interval_end_distance_m
                            / configured_segments.segment_length_m
                        ) as int),
                        1
                    )
                )
            )
),

allocated_intervals as (
    select
        *,
        case
            when interval_distance_m > 0
            then greatest(interval_start_distance_m, segment_start_boundary_m)
            else interval_end_distance_m
        end as allocated_start_distance_m,
        case
            when interval_distance_m > 0
            then least(interval_end_distance_m, segment_end_boundary_m)
            else interval_end_distance_m
        end as allocated_end_distance_m
    from interval_segment_matches
),

allocation_fractions as (
    select
        *,
        allocated_end_distance_m - allocated_start_distance_m as allocated_distance_m,
        case
            when interval_distance_m > 0
            then (allocated_start_distance_m - interval_start_distance_m) / interval_distance_m
            else 0.0
        end as allocation_start_fraction,
        case
            when interval_distance_m > 0
            then (allocated_end_distance_m - interval_start_distance_m) / interval_distance_m
            else 1.0
        end as allocation_end_fraction
    from allocated_intervals
),

allocation_values as (
    select
        *,
        case
            when interval_distance_m > 0
            then interval_duration_seconds * allocated_distance_m / interval_distance_m
            else interval_duration_seconds
        end as allocated_duration_seconds,
        (allocation_start_fraction + allocation_end_fraction) / 2.0
            as allocation_midpoint_fraction
    from allocation_fractions
),

interpolated_allocations as (
    select
        *,
        cast(from_unixtime(cast(
            unix_timestamp(interval_start_timestamp)
            + interval_duration_seconds * allocation_start_fraction
            as bigint
        )) as timestamp) as allocated_start_timestamp,
        cast(from_unixtime(cast(
            unix_timestamp(interval_start_timestamp)
            + interval_duration_seconds * allocation_end_fraction
            as bigint
        )) as timestamp) as allocated_end_timestamp,
        case
            when previous_heart_rate is not null and heart_rate is not null
            then previous_heart_rate
                + (heart_rate - previous_heart_rate) * allocation_midpoint_fraction
            else coalesce(heart_rate, previous_heart_rate)
        end as allocated_heart_rate,
        case
            when previous_heart_rate is not null and heart_rate is not null
            then previous_heart_rate
                + (heart_rate - previous_heart_rate) * allocation_start_fraction
            else coalesce(previous_heart_rate, heart_rate)
        end as allocated_start_heart_rate,
        case
            when previous_heart_rate is not null and heart_rate is not null
            then previous_heart_rate
                + (heart_rate - previous_heart_rate) * allocation_end_fraction
            else coalesce(heart_rate, previous_heart_rate)
        end as allocated_end_heart_rate,
        case
            when previous_running_cadence is not null and running_cadence is not null
            then previous_running_cadence
                + (running_cadence - previous_running_cadence) * allocation_midpoint_fraction
            else coalesce(running_cadence, previous_running_cadence)
        end as allocated_running_cadence,
        case
            when previous_altitude_m is not null and altitude_m is not null
            then previous_altitude_m
                + (altitude_m - previous_altitude_m) * allocation_start_fraction
            else coalesce(previous_altitude_m, altitude_m)
        end as allocated_start_altitude_m,
        case
            when previous_altitude_m is not null and altitude_m is not null
            then previous_altitude_m
                + (altitude_m - previous_altitude_m) * allocation_end_fraction
            else coalesce(altitude_m, previous_altitude_m)
        end as allocated_end_altitude_m,
        case
            when previous_latitude_deg is not null and position_lat_deg is not null
            then previous_latitude_deg
                + (position_lat_deg - previous_latitude_deg) * allocation_start_fraction
            else coalesce(previous_latitude_deg, position_lat_deg)
        end as allocated_start_latitude_deg,
        case
            when previous_latitude_deg is not null and position_lat_deg is not null
            then previous_latitude_deg
                + (position_lat_deg - previous_latitude_deg) * allocation_end_fraction
            else coalesce(position_lat_deg, previous_latitude_deg)
        end as allocated_end_latitude_deg,
        case
            when previous_longitude_deg is not null and position_long_deg is not null
            then previous_longitude_deg
                + (position_long_deg - previous_longitude_deg) * allocation_start_fraction
            else coalesce(previous_longitude_deg, position_long_deg)
        end as allocated_start_longitude_deg,
        case
            when previous_longitude_deg is not null and position_long_deg is not null
            then previous_longitude_deg
                + (position_long_deg - previous_longitude_deg) * allocation_end_fraction
            else coalesce(position_long_deg, previous_longitude_deg)
        end as allocated_end_longitude_deg,
        case
            when allocated_duration_seconds > 0 then allocated_duration_seconds
            when allocated_distance_m > 0 then allocated_distance_m
            else 1.0
        end as telemetry_weight
    from allocation_values
),

segment_rollups as (
    select
        run_id,
        activity_id,
        activity_date,
        unit_system,
        segment_length_value,
        segment_length_m,
        segment_length_label,
        is_canonical,
        segment_index,
        segment_start_boundary_m,
        segment_end_boundary_m,
        min(allocated_start_timestamp) as segment_start_timestamp,
        max(allocated_end_timestamp) as segment_end_timestamp,
        min(allocated_start_distance_m) as segment_start_distance_m,
        max(allocated_end_distance_m) as segment_end_distance_m,
        sum(allocated_distance_m) as segment_distance_m,
        sum(allocated_duration_seconds) as segment_duration_seconds,
        sum(case
            when allocated_heart_rate is not null
            then allocated_heart_rate * telemetry_weight
        end) / nullif(sum(case
            when allocated_heart_rate is not null
            then telemetry_weight
        end), 0.0) as avg_heart_rate,
        max(greatest(allocated_start_heart_rate, allocated_end_heart_rate)) as max_heart_rate,
        sum(case
            when allocated_running_cadence is not null
            then allocated_running_cadence * telemetry_weight
        end) / nullif(sum(case
            when allocated_running_cadence is not null
            then telemetry_weight
        end), 0.0) as avg_running_cadence,
        min(least(allocated_start_altitude_m, allocated_end_altitude_m)) as min_altitude_m,
        max(greatest(allocated_start_altitude_m, allocated_end_altitude_m)) as max_altitude_m,
        min_by(
            allocated_start_altitude_m,
            allocated_start_distance_m + cast(record_index as double) * 0.000000000001
        ) as segment_start_altitude_m,
        max_by(
            allocated_end_altitude_m,
            allocated_end_distance_m + cast(record_index as double) * 0.000000000001
        ) as segment_end_altitude_m,
        min_by(
            allocated_start_latitude_deg,
            allocated_start_distance_m + cast(record_index as double) * 0.000000000001
        )
            as segment_start_latitude_deg,
        min_by(
            allocated_start_longitude_deg,
            allocated_start_distance_m + cast(record_index as double) * 0.000000000001
        )
            as segment_start_longitude_deg,
        max_by(
            allocated_end_latitude_deg,
            allocated_end_distance_m + cast(record_index as double) * 0.000000000001
        )
            as segment_end_latitude_deg,
        max_by(
            allocated_end_longitude_deg,
            allocated_end_distance_m + cast(record_index as double) * 0.000000000001
        )
            as segment_end_longitude_deg,
        min_by(
            coalesce(previous_h3_cell_resolution_8, h3_cell_resolution_8),
            allocated_start_timestamp
        ) as start_h3_cell_resolution_8,
        max_by(
            coalesce(h3_cell_resolution_8, previous_h3_cell_resolution_8),
            allocated_end_timestamp
        ) as end_h3_cell_resolution_8,
        min_by(
            coalesce(h3_cell_resolution_8, previous_h3_cell_resolution_8),
            allocated_start_distance_m
        ) as representative_h3_cell_resolution_8,
        min_by(
            coalesce(h3_cell_resolution_9, previous_h3_cell_resolution_9),
            allocated_start_distance_m
        ) as representative_h3_cell_resolution_9,
        count(distinct record_index) as record_count
    from interpolated_allocations
    group by
        run_id,
        activity_id,
        activity_date,
        unit_system,
        segment_length_value,
        segment_length_m,
        segment_length_label,
        is_canonical,
        segment_index,
        segment_start_boundary_m,
        segment_end_boundary_m
)

select
    run_id,
    activity_id,
    activity_date,
    unit_system,
    segment_length_value,
    segment_length_m,
    segment_length_label,
    is_canonical,
    segment_index,
    segment_start_boundary_m,
    segment_end_boundary_m,
    segment_start_timestamp,
    segment_end_timestamp,
    segment_start_distance_m,
    segment_end_distance_m,
    segment_distance_m,
    segment_distance_m / 1000.0 as segment_distance_km,
    case
        when unit_system = 'metric' then segment_distance_m / 1000.0
        when unit_system = 'imperial' then segment_distance_m / 1609.344
    end as segment_distance_value,
    segment_duration_seconds,
    case
        when segment_distance_m > 0
        then segment_duration_seconds / 60.0 / (segment_distance_m / 1000.0)
    end as segment_pace_min_per_km,
    case
        when segment_duration_seconds > 0
        then segment_distance_m / segment_duration_seconds * 3.6
    end as avg_speed_kmh,
    avg_heart_rate,
    max_heart_rate,
    avg_running_cadence,
    min_altitude_m,
    max_altitude_m,
    segment_end_altitude_m - segment_start_altitude_m as elevation_change_m,
    case
        when segment_distance_m > 0
        then (segment_end_altitude_m - segment_start_altitude_m) / segment_distance_m
    end as segment_grade,
    segment_start_latitude_deg,
    segment_start_longitude_deg,
    segment_end_latitude_deg,
    segment_end_longitude_deg,
    start_h3_cell_resolution_8,
    end_h3_cell_resolution_8,
    representative_h3_cell_resolution_8,
    representative_h3_cell_resolution_9,
    record_count
from segment_rollups
