{{ config(materialized='view') }}

with records as (
    select *
    from {{ source('garmin_raw', 'garmin_fit_records') }}
),

deduplicated_records as (
    select *
    from (
        select
            *,
            row_number() over (
                partition by run_id, timestamp
                order by source_file_modification_time desc, ingested_at desc
            ) as record_rank
        from records
    )
    where record_rank = 1
),

records_with_run_context as (
    select
        runs.activity_id,
        runs.activity_date,
        records.run_id,
        cast(records.timestamp as timestamp) as record_timestamp,
        cast(records.run_date as date) as record_date,
        records.distance as record_distance_m,
        records.distance / 1000.0 as record_distance_km,
        records.enhanced_speed as speed_mps,
        records.enhanced_speed * 3.6 as speed_kmh,
        case
            when records.enhanced_speed > 0
            then (1000.0 / records.enhanced_speed) / 60.0
        end as pace_min_per_km,
        records.heart_rate,
        records.cadence * 2.0 as cadence,
        records.fractional_cadence,
        case
            when records.cadence is not null
            then (records.cadence + coalesce(records.fractional_cadence, 0.0)) * 2.0
        end as running_cadence,
        records.enhanced_altitude as altitude_m,
        records.temperature,
        records.activity_type,
        records.position_lat,
        records.position_long,
        records.position_lat_deg,
        records.position_long_deg,
        records.stance_time,
        records.vertical_oscillation,
        records.vertical_ratio,
        records.step_length,
        records.cycle_length16,
        records.source_file_name,
        records.source_file_path,
        records.source_file_size_bytes,
        records.source_file_modification_time,
        records.ingested_at
    from deduplicated_records as records
    inner join {{ ref('silver_runs') }} as runs
        on records.run_id = runs.run_id
),

sequenced_records as (
    select
        *,
        row_number() over (
            partition by run_id
            order by record_timestamp
        ) as record_index,
        first_value(record_timestamp) over (
            partition by run_id
            order by record_timestamp
            rows between unbounded preceding and unbounded following
        ) as first_record_timestamp,
        lag(record_timestamp) over (
            partition by run_id
            order by record_timestamp
        ) as previous_record_timestamp,
        lag(record_distance_m) over (
            partition by run_id
            order by record_timestamp
        ) as previous_record_distance_m,
        lag(altitude_m) over (
            partition by run_id
            order by record_timestamp
        ) as previous_altitude_m
    from records_with_run_context
)

select
    activity_id,
    activity_date,
    run_id,
    record_timestamp,
    record_date,
    record_index,
    cast(unix_timestamp(record_timestamp) - unix_timestamp(first_record_timestamp) as bigint)
        as elapsed_seconds,
    cast(unix_timestamp(record_timestamp) - unix_timestamp(previous_record_timestamp) as bigint)
        as seconds_since_previous_record,
    record_distance_m,
    record_distance_km,
    record_distance_m - previous_record_distance_m as distance_delta_m,
    speed_mps,
    speed_kmh,
    pace_min_per_km,
    heart_rate,
    cadence,
    fractional_cadence,
    running_cadence,
    altitude_m,
    altitude_m - previous_altitude_m as altitude_delta_m,
    temperature,
    activity_type,
    position_lat,
    position_long,
    position_lat_deg,
    position_long_deg,
    case
        when position_lat_deg between -90 and 90
            and position_long_deg between -180 and 180
        then h3_longlatash3(position_long_deg, position_lat_deg, 8)
    end as h3_cell_resolution_8,
    case
        when position_lat_deg between -90 and 90
            and position_long_deg between -180 and 180
        then h3_longlatash3(position_long_deg, position_lat_deg, 9)
    end as h3_cell_resolution_9,
    case
        when position_lat_deg between -90 and 90
            and position_long_deg between -180 and 180
        then concat('POINT (', cast(position_long_deg as string), ' ', cast(position_lat_deg as string), ')')
    end as record_point_wkt,
    stance_time,
    vertical_oscillation,
    vertical_ratio,
    step_length,
    cycle_length16,
    source_file_name,
    source_file_path,
    source_file_size_bytes,
    source_file_modification_time,
    ingested_at
from sequenced_records
