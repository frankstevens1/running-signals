with run_availability as (
    select
        'run' as entity,
        'all' as period_grain,
        cast(null as date) as period_start_date,
        'garmin_recovery_hr' as metric_name,
        count(*) as denominator_count,
        count(garmin_recovery_hr) as available_count
    from {{ ref('silver_runs') }}

    union all

    select
        'run',
        'all',
        cast(null as date),
        'session_avg_heart_rate',
        count(*),
        count(avg_heart_rate)
    from {{ ref('silver_runs') }}

    union all

    select
        'run',
        'all',
        cast(null as date),
        'record_rows_present',
        count(*),
        sum(case when record_count > 0 then 1 else 0 end)
    from {{ ref('silver_runs') }}

    union all

    select
        'run',
        'all',
        cast(null as date),
        'record_distance_coverage_ratio',
        count(*),
        count(record_distance_coverage_ratio)
    from {{ ref('silver_runs') }}

    union all

    select
        'run',
        'all',
        cast(null as date),
        'record_distance_coverage_95_pct',
        count(*),
        sum(case when record_distance_coverage_ratio >= 0.95 then 1 else 0 end)
    from {{ ref('silver_runs') }}

    union all

    select
        'run',
        'all',
        cast(null as date),
        'gps_records_present',
        count(*),
        sum(case when gps_record_count > 0 then 1 else 0 end)
    from {{ ref('silver_runs') }}
),

run_month_availability as (
    select
        entity,
        'month' as period_grain,
        cast(date_trunc('month', activity_date) as date) as period_start_date,
        metric_name,
        count(*) as denominator_count,
        sum(is_available) as available_count
    from (
        select
            'run' as entity,
            activity_date,
            stack(
                6,
                'garmin_recovery_hr', case when garmin_recovery_hr is not null then 1 else 0 end,
                'session_avg_heart_rate', case when avg_heart_rate is not null then 1 else 0 end,
                'record_rows_present', case when record_count > 0 then 1 else 0 end,
                'record_distance_coverage_ratio', case when record_distance_coverage_ratio is not null then 1 else 0 end,
                'record_distance_coverage_95_pct', case when record_distance_coverage_ratio >= 0.95 then 1 else 0 end,
                'gps_records_present', case when gps_record_count > 0 then 1 else 0 end
            ) as (metric_name, is_available)
        from {{ ref('silver_runs') }}
    )
    group by
        entity,
        cast(date_trunc('month', activity_date) as date),
        metric_name
),

segment_availability as (
    select
        'segment' as entity,
        'all' as period_grain,
        cast(null as date) as period_start_date,
        'segment_pace_for_positive_distance' as metric_name,
        sum(case
            when segment_distance_km > 0
                and segment_start_timestamp is not null
                and segment_end_timestamp is not null
            then 1 else 0
        end) as denominator_count,
        sum(case
            when segment_distance_km > 0
                and segment_start_timestamp is not null
                and segment_end_timestamp is not null
                and segment_pace_min_per_km is not null
            then 1 else 0
        end) as available_count
    from {{ ref('mart_run_segments') }}

    union all

    select
        'segment',
        'all',
        cast(null as date),
        'avg_heart_rate',
        count(*),
        count(avg_heart_rate)
    from {{ ref('mart_run_segments') }}

    union all

    select
        'segment',
        'all',
        cast(null as date),
        'avg_running_cadence',
        count(*),
        count(avg_running_cadence)
    from {{ ref('mart_run_segments') }}

    union all

    select
        'segment',
        'all',
        cast(null as date),
        'altitude_range',
        count(*),
        sum(case when min_altitude_m is not null and max_altitude_m is not null then 1 else 0 end)
    from {{ ref('mart_run_segments') }}

    union all

    select
        'segment',
        'all',
        cast(null as date),
        'elevation_change',
        count(*),
        count(elevation_change_m)
    from {{ ref('mart_run_segments') }}

    union all

    select
        'segment',
        'all',
        cast(null as date),
        'segment_grade',
        count(*),
        count(segment_grade)
    from {{ ref('mart_run_segments') }}
),

segment_month_availability as (
    select
        entity,
        'month' as period_grain,
        cast(date_trunc('month', activity_date) as date) as period_start_date,
        metric_name,
        sum(denominator_increment) as denominator_count,
        sum(available_increment) as available_count
    from (
        select
            'segment' as entity,
            activity_date,
            stack(
                6,
                'segment_pace_for_positive_distance',
                    case
                        when segment_distance_km > 0
                            and segment_start_timestamp is not null
                            and segment_end_timestamp is not null
                        then 1 else 0
                    end,
                    case
                        when segment_distance_km > 0
                            and segment_start_timestamp is not null
                            and segment_end_timestamp is not null
                            and segment_pace_min_per_km is not null
                        then 1 else 0
                    end,
                'avg_heart_rate',
                    1,
                    case when avg_heart_rate is not null then 1 else 0 end,
                'avg_running_cadence',
                    1,
                    case when avg_running_cadence is not null then 1 else 0 end,
                'altitude_range',
                    1,
                    case when min_altitude_m is not null and max_altitude_m is not null then 1 else 0 end,
                'elevation_change',
                    1,
                    case when elevation_change_m is not null then 1 else 0 end,
                'segment_grade',
                    1,
                    case when segment_grade is not null then 1 else 0 end
            ) as (metric_name, denominator_increment, available_increment)
        from {{ ref('mart_run_segments') }}
    )
    group by
        entity,
        cast(date_trunc('month', activity_date) as date),
        metric_name
),

availability as (
    select * from run_availability
    union all
    select * from run_month_availability
    union all
    select * from segment_availability
    union all
    select * from segment_month_availability
)

select
    entity,
    period_grain,
    period_start_date,
    metric_name,
    denominator_count,
    available_count,
    denominator_count - available_count as missing_count,
    round(100.0 * available_count / nullif(denominator_count, 0), 2) as availability_pct
from availability
order by
    entity,
    period_grain,
    period_start_date,
    metric_name
