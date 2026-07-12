{{ config(materialized='table') }}

select
    run_id,
    activity_id,
    activity_date,
    record_index,
    record_timestamp,
    elapsed_seconds,
    seconds_since_previous_record,
    record_distance_m,
    record_distance_km,
    distance_delta_m,
    speed_mps,
    speed_kmh,
    pace_min_per_km,
    heart_rate,
    running_cadence,
    altitude_m,
    altitude_delta_m,
    temperature,
    position_lat_deg,
    position_long_deg
from {{ ref('silver_run_records') }}
