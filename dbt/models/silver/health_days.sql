{{ config(materialized='view') }}

with payloads as (
    select *
    from {{ source('garmin_raw', 'garmin_health_daily_payloads') }}
),

extracted as (
    select
        *,
        coalesce(
            get_json_object(raw_payload, '$.dailySleepDTO.sleepStartTimestampGMT'),
            get_json_object(raw_payload, '$.sleepStartTimestampGMT'),
            get_json_object(raw_payload, '$.sleepStartTimeGMT')
        ) as sleep_start_time_raw,
        coalesce(
            get_json_object(raw_payload, '$.dailySleepDTO.sleepEndTimestampGMT'),
            get_json_object(raw_payload, '$.sleepEndTimestampGMT'),
            get_json_object(raw_payload, '$.sleepEndTimeGMT')
        ) as sleep_end_time_raw
    from payloads
),

daily as (
    select
        cast(calendar_date as date) as calendar_date,

        max(case when payload_type = 'hrv' then 1 else 0 end) = 1 as has_hrv_payload,
        max(case when payload_type = 'rhr' then 1 else 0 end) = 1 as has_rhr_payload,
        max(case when payload_type = 'sleep' then 1 else 0 end) = 1 as has_sleep_payload,
        max(case when payload_type = 'heart_rates' then 1 else 0 end) = 1 as has_heart_rates_payload,

        max(case
            when payload_type = 'rhr'
            then try_cast(coalesce(
                get_json_object(raw_payload, '$.restingHeartRate'),
                get_json_object(raw_payload, '$.allMetrics.metricsMap.WELLNESS_RESTING_HEART_RATE'),
                get_json_object(raw_payload, '$.value')
            ) as double)
        end) as rhr_resting_heart_rate,

        max(case
            when payload_type = 'heart_rates'
            then try_cast(get_json_object(raw_payload, '$.restingHeartRate') as double)
        end) as heart_rates_resting_heart_rate,

        max(case
            when payload_type = 'hrv'
            then try_cast(coalesce(
                get_json_object(raw_payload, '$.hrvSummary.lastNightAvg'),
                get_json_object(raw_payload, '$.hrvSummary.weeklyAvg'),
                get_json_object(raw_payload, '$.lastNightAvg'),
                get_json_object(raw_payload, '$.hrvValue')
            ) as double)
        end) as hrv_value,

        max(case
            when payload_type = 'hrv'
            then coalesce(
                get_json_object(raw_payload, '$.hrvSummary.status'),
                get_json_object(raw_payload, '$.status')
            )
        end) as hrv_status,

        max(case
            when payload_type = 'sleep'
            then try_cast(coalesce(
                get_json_object(raw_payload, '$.dailySleepDTO.sleepScores.overall.value'),
                get_json_object(raw_payload, '$.dailySleepDTO.sleepScore'),
                get_json_object(raw_payload, '$.overallSleepScore.value'),
                get_json_object(raw_payload, '$.sleepScore')
            ) as double)
        end) as sleep_score,

        max(case
            when payload_type = 'sleep'
            then try_cast(coalesce(
                get_json_object(raw_payload, '$.dailySleepDTO.sleepTimeSeconds'),
                get_json_object(raw_payload, '$.sleepTimeSeconds'),
                get_json_object(raw_payload, '$.durationInSeconds')
            ) as bigint)
        end) as sleep_duration_seconds,

        max(case
            when payload_type = 'sleep'
            then case
                when sleep_start_time_raw rlike '^[0-9]{13}$'
                then to_timestamp(from_unixtime(cast(try_cast(sleep_start_time_raw as bigint) / 1000 as bigint)))
                when sleep_start_time_raw rlike '^[0-9]{10}$'
                then to_timestamp(from_unixtime(try_cast(sleep_start_time_raw as bigint)))
                else try_cast(sleep_start_time_raw as timestamp)
            end
        end) as sleep_start_time,

        max(case
            when payload_type = 'sleep'
            then case
                when sleep_end_time_raw rlike '^[0-9]{13}$'
                then to_timestamp(from_unixtime(cast(try_cast(sleep_end_time_raw as bigint) / 1000 as bigint)))
                when sleep_end_time_raw rlike '^[0-9]{10}$'
                then to_timestamp(from_unixtime(try_cast(sleep_end_time_raw as bigint)))
                else try_cast(sleep_end_time_raw as timestamp)
            end
        end) as sleep_end_time,

        max(ingested_at) as latest_health_ingested_at,
        max(source_file_modification_time) as latest_health_source_file_modification_time
    from extracted
    group by cast(calendar_date as date)
)

select
    calendar_date,
    coalesce(rhr_resting_heart_rate, heart_rates_resting_heart_rate) as resting_heart_rate,
    hrv_value,
    hrv_status,
    sleep_score,
    sleep_duration_seconds,
    sleep_start_time,
    sleep_end_time,
    has_hrv_payload,
    has_rhr_payload,
    has_sleep_payload,
    has_heart_rates_payload,
    latest_health_ingested_at,
    latest_health_source_file_modification_time
from daily
