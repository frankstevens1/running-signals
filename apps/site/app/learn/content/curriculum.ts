export interface Step {
  id: string;
  module: string;
  title: string;
  context: string;
  sql: string;
  codeLang?: string;
  keyTechnique?: string;
  lineageContext?: string;
}

export interface Module {
  id: string;
  label: string;
}

export const modules: Module[] = [
  { id: "foundation", label: "1. Foundation" },
  { id: "daily", label: "2. Daily Foundation" },
  { id: "calendar", label: "3. Calendar Rollups" },
  { id: "intermediates", label: "4. Intermediates" },
  { id: "within-run", label: "5. Within-Run Analytics" },
  { id: "route", label: "6. Route Analytics" },
  { id: "signals", label: "7. Signals" },
];

export const curriculum: Step[] = [
  // ── MODULE 1: Foundation ──
  {
    id: "bronze-sources",
    module: "foundation",
    title: "Bronze Sources",
    context:
      "All analytical models trace back to four bronze tables that mirror the structure of the " +
      "original Garmin data rather than following an analytical model. These tables are " +
      "source-shaped, not transformed.\n\n" +
      "Three FIT tables — `garmin_fit_sessions`, `garmin_fit_records`, and `garmin_fit_events` — " +
      "are parsed from `.fit` binary files produced by a Garmin watch during a run. " +
      "`garmin_health_daily_payloads` stores raw JSON blobs from the Garmin Connect API, keyed " +
      "on `calendar_date` and `payload_type`. The raw JSON is preserved so the pipeline can " +
      "recover health metrics without re-downloading.\n\n" +
      "The dbt source contract (shown in the code pane) declares these four tables and enforces " +
      "required identifiers via source tests. Every silver model references them with " +
      "`{{ source('garmin_raw', '...') }}`.",
    sql: `version: 2

sources:
  - name: garmin_raw
    catalog: "{{ env_var('DATABRICKS_CATALOG') }}"
    schema: "{{ env_var('DATABRICKS_BRONZE_SCHEMA', 'bronze') }}"
    tables:
      - name: garmin_fit_sessions
        description: >-
          Bronze Garmin FIT session messages WITH one ROW
          per running activity.
        columns:
          - name: run_id
            tests:
              - not_null
              - UNIQUE
          - name: garmin_activity_id
            tests:
              - not_null
          - name: run_date
            tests:
              - not_null

      - name: garmin_fit_events
        description: >-
          Bronze Garmin FIT event messages filtered to timer
          AND recovery-heart-rate events.
        columns:
          - name: run_id
            tests:
              - not_null
          - name: run_date
            tests:
              - not_null

      - name: garmin_fit_records
        description: >-
          Bronze Garmin FIT record messages WITH high-frequency
          activity telemetry.
        columns:
          - name: run_id
            tests:
              - not_null
          - name: timestamp
            tests:
              - not_null
          - name: run_date
            tests:
              - not_null

      - name: garmin_health_daily_payloads
        description: >-
          Bronze Garmin Connect daily health JSON payloads
          WITH one ROW per calendar date AND endpoint
          payload type.
        tests:
          - unique_combination_of_columns:
              arguments:
                combination_of_columns:
                  ["calendar_date", "payload_type"]
        columns:
          - name: calendar_date
            tests:
              - not_null
          - name: payload_type
            tests:
              - not_null
              - accepted_values:
                  arguments:
                    VALUES: ["hrv", "rhr", "sleep", "heart_rates"]`,
    codeLang: "yml",
    keyTechnique:
      "Bronze tables carry `source_file_name`, `source_file_path`, `source_file_modification_time`, and `ingested_at` on every row for full traceability back to the original S3 objects.",
    lineageContext: "These four tables are the only external sources in the dbt DAG. All silver models ref them via `{{ source('garmin_raw', '...') }}`.",
  },
  {
    id: "dates",
    module: "foundation",
    title: "Calendar Spine — dates",
    context:
      "`dates` generates a dense calendar-day spine from the first observed run through today. " +
      "Without this spine, days with no runs would create gaps, breaking window functions and " +
      "making it impossible to distinguish 'zero runs' from 'no data.'\n\n" +
      "The spine uses `explode(sequence(...))` to produce one row per day. Each row carries " +
      "calendar attributes — week, month, quarter, year boundaries — that downstream rollups " +
      "group on. The spine starts from the first observed run date, not an arbitrary epoch, so " +
      "the calendar is data-driven.\n\n" +
      "The `is_completed_day` flag uses the analytics timezone macro to determine whether today " +
      "has ended yet, preventing partial-day data from appearing as a completed observation.",
    sql: `WITH observed_dates AS (
    SELECT activity_date AS calendar_date
    FROM {{ ref('runs') }}
),

date_bounds AS (
    SELECT
        MIN(calendar_date) AS first_observed_date,
        {{ analytics_current_date() }} AS latest_completed_date
    FROM observed_dates
),

date_spine AS (
    SELECT EXPLODE(SEQUENCE(
        first_observed_date,
        latest_completed_date,
        INTERVAL 1 day
    )) AS calendar_date
    FROM date_bounds
    WHERE first_observed_date IS NOT NULL
        AND first_observed_date <= latest_completed_date
)

SELECT
    CAST(calendar_date AS date) AS calendar_date,
    calendar_date <= {{ analytics_current_date() }} AS is_completed_day,
    DAYOFWEEK(calendar_date) AS day_of_week_number,
    DATE_FORMAT(calendar_date, 'E') AS day_of_week_name,
    DAYOFMONTH(calendar_date) AS day_of_month,
    WEEKOFYEAR(calendar_date) AS week_of_year,
    CAST(DATE_TRUNC('week', calendar_date) AS date) AS week_start_date,
    DATE_ADD(CAST(DATE_TRUNC('week', calendar_date) AS date), 6) AS week_end_date,
    MONTH(calendar_date) AS calendar_month,
    CAST(DATE_TRUNC('month', calendar_date) AS date) AS month_start_date,
    LAST_DAY(calendar_date) AS month_end_date,
    QUARTER(calendar_date) AS calendar_quarter,
    YEAR(calendar_date) AS calendar_year,
    CAST(DATE_TRUNC('year', calendar_date) AS date) AS year_start_date,
    DATE_ADD(add_months(
        CAST(DATE_TRUNC('year', calendar_date) AS date), 12), -1
    ) AS year_end_date,
    DAYOFWEEK(calendar_date) IN (1, 7) AS is_weekend
FROM date_spine`,
    keyTechnique:
      "`explode(sequence(start, end, interval))` generates a dense calendar spine in one operation. The `where` clause guards against null bounds when no data exists yet.",
    lineageContext:
      "`dates` refs `runs` to find the first observed date. All downstream calendar rollups receive this spine via `mart_days`.",
  },
  {
    id: "runs",
    module: "foundation",
    title: "Canonical Run Building Block — runs",
    context:
      "`runs` is the single standardization point for all run-level analysis. It takes raw FIT " +
      "session data and enriches it with Garmin Recovery HR from events, the latest recorded " +
      "heart rate from telemetry, and a record-level summary (count, timestamps, GPS coverage).\n\n" +
      "Every downstream model — `mart_days`, `mart_run_sessions`, `mart_fitness`, `mart_routes` — " +
      "reads from `runs` rather than the bronze FIT tables directly. This makes `runs` the " +
      "canonical place for unit conversions (metres → kilometres, m/s → km/h) and cadence " +
      "normalization (Garmin reports per-leg cadence, so it's doubled to total steps per minute).\n\n" +
      "The `record_distance_coverage_ratio` compares the cumulative distance from per-second " +
      "telemetry against the session-level FIT distance. A ratio near 1.0 means the records " +
      "cover the entire run; a low ratio may indicate sparse or missing telemetry.",
    sql: `WITH sessions AS (
    SELECT * FROM {{ source('garmin_raw', 'garmin_fit_sessions') }}
),

recovery_events AS (
    SELECT run_id, recovery_heart_rate
    FROM (
        SELECT run_id, TRY_CAST(data AS double) AS recovery_heart_rate,
            ROW_NUMBER() OVER (
                PARTITION BY run_id
                ORDER BY CAST(timestamp AS timestamp) DESC,
                         source_file_modification_time DESC,
                         ingested_at DESC
            ) AS recovery_event_rank
        FROM {{ source('garmin_raw', 'garmin_fit_events') }}
        WHERE event = 'recovery_hr'
    ) WHERE recovery_event_rank = 1
),

last_record_heart_rates AS (
    SELECT run_id, heart_rate AS last_record_heart_rate
    FROM (
        SELECT run_id, heart_rate,
            ROW_NUMBER() OVER (
                PARTITION BY run_id
                ORDER BY CAST(timestamp AS timestamp) DESC,
                         source_file_modification_time DESC,
                         ingested_at DESC
            ) AS heart_rate_rank
        FROM fit_records WHERE heart_rate IS NOT NULL
    ) WHERE heart_rate_rank = 1
),

record_summary AS (
    SELECT run_id,
        COUNT(*) AS record_count,
        COUNT(position_lat_deg) AS gps_record_count,
        MIN(CAST(timestamp AS timestamp)) AS first_record_timestamp,
        MAX(CAST(timestamp AS timestamp)) AS last_record_timestamp,
        min_by(position_lat_deg, CAST(timestamp AS timestamp))
            AS start_record_latitude_deg,
        min_by(position_long_deg, CAST(timestamp AS timestamp))
            AS start_record_longitude_deg,
        max_by(position_lat_deg, CAST(timestamp AS timestamp))
            AS end_record_latitude_deg,
        max_by(position_long_deg, CAST(timestamp AS timestamp))
            AS end_record_longitude_deg,
        MAX(distance) / 1000.0 AS record_distance_km
    FROM fit_records GROUP BY run_id
)

SELECT
    sessions.run_id, sessions.garmin_activity_id AS activity_id,
    CAST(sessions.run_date AS date) AS activity_date,
    sessions.total_distance / 1000.0 AS distance_km,
    sessions.total_timer_time AS duration_seconds,
    CASE WHEN sessions.total_distance > 0 AND sessions.total_timer_time IS NOT NULL
        THEN sessions.total_timer_time / 60.0
             / (sessions.total_distance / 1000.0)
    END AS avg_pace_min_per_km,
    CASE
        WHEN sessions.enhanced_avg_speed IS NOT NULL
        THEN sessions.enhanced_avg_speed * 3.6
        WHEN sessions.total_timer_time > 0
        THEN (sessions.total_distance / 1000.0) / (sessions.total_timer_time / 3600.0)
    END AS speed_kmh,
    sessions.avg_heart_rate, sessions.max_heart_rate,
    last_record_heart_rates.last_record_heart_rate AS ending_heart_rate,
    sessions.avg_cadence * 2.0 AS avg_cadence,
    sessions.max_cadence * 2.0 AS max_cadence,
    sessions.total_ascent, sessions.total_descent,
    sessions.enhanced_avg_speed, sessions.enhanced_max_speed,
    CASE WHEN last_record_heart_rates.last_record_heart_rate IS NOT NULL
             AND recovery_events.recovery_heart_rate IS NOT NULL
        THEN last_record_heart_rates.last_record_heart_rate
             - recovery_events.recovery_heart_rate
    END AS garmin_recovery_hr,
    record_summary.record_count,
    record_summary.gps_record_count,
    record_summary.first_record_timestamp,
    record_summary.last_record_timestamp,
    CASE WHEN sessions.total_distance > 0
             AND record_summary.record_distance_km IS NOT NULL
        THEN record_summary.record_distance_km
             / (sessions.total_distance / 1000.0)
    END AS record_distance_coverage_ratio,
    sessions.source_file_name, sessions.source_file_path,
    sessions.source_file_modification_time, sessions.ingested_at
FROM sessions
LEFT JOIN recovery_events ON sessions.run_id = recovery_events.run_id
LEFT JOIN last_record_heart_rates
    ON sessions.run_id = last_record_heart_rates.run_id
LEFT JOIN record_summary ON sessions.run_id = record_summary.run_id`,
    keyTechnique:
      "`row_number()` with deterministic ordering ensures idempotent deduplication: the same input always produces the same recovery HR and ending heart rate, even after re-ingestion.",
    lineageContext:
      "`runs` refs all three FIT bronze sources. It is the only model that reads `garmin_fit_events` directly. Downstream: `mart_days`, `mart_fitness`, `mart_run_sessions`, `route_observations`.",
  },
  {
    id: "run-records",
    module: "foundation",
    title: "Per-Record Telemetry — run_records",
    context:
      "`run_records` cleans and enriches the per-second FIT telemetry. Each row represents " +
      "one timestamped observation from a Garmin device during a run.\n\n" +
      "Four key transformations: deduplication by `run_id` and timestamp with deterministic " +
      "ordering; sequencing via `row_number()` and `lag()` to compute `record_index`, " +
      "`elapsed_seconds`, and deltas (`distance_delta_m`, `altitude_delta_m`); cadence " +
      "normalization from per-leg to total steps per minute including `fractional_cadence`; " +
      "and H3 geo-indexing at resolutions 8 and 9 for route similarity matching.\n\n" +
      "H3 cells are only computed for valid GPS coordinates (latitude between -90 and 90, " +
      "longitude between -180 and 180). Records without GPS have null H3 cells and are " +
      "excluded from route analysis but retained for within-run metrics.",
    sql: `WITH deduplicated_records AS (
    SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (
            PARTITION BY run_id, timestamp
            ORDER BY source_file_modification_time DESC, ingested_at DESC
        ) AS record_rank
        FROM records
    ) WHERE record_rank = 1
),

records_with_run_context AS (
    SELECT
        records.run_id,
        CAST(records.timestamp AS timestamp) AS record_timestamp,
        records.distance AS record_distance_m,
        records.distance / 1000.0 AS record_distance_km,
        records.enhanced_speed AS speed_mps,
        records.enhanced_speed * 3.6 AS speed_kmh,
        CASE WHEN records.enhanced_speed > 0
            THEN (1000.0 / records.enhanced_speed) / 60.0
        END AS pace_min_per_km,
        records.heart_rate,
        records.cadence * 2.0 AS cadence,
        records.fractional_cadence,
        CASE WHEN records.cadence IS NOT NULL
            THEN (records.cadence
                  + COALESCE(records.fractional_cadence, 0.0)) * 2.0
        END AS running_cadence,
        records.enhanced_altitude AS altitude_m,
        records.position_lat_deg, records.position_long_deg
    FROM deduplicated_records AS records
    INNER JOIN {{ ref('runs') }} AS runs
        ON records.run_id = runs.run_id
),

sequenced_records AS (
    SELECT *,
        ROW_NUMBER() OVER (
            PARTITION BY run_id ORDER BY record_timestamp
        ) AS record_index,
        FIRST_VALUE(record_timestamp) OVER (
            PARTITION BY run_id ORDER BY record_timestamp
            ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
        ) AS first_record_timestamp,
        LAG(record_timestamp) OVER (
            PARTITION BY run_id ORDER BY record_timestamp
        ) AS previous_record_timestamp,
        LAG(record_distance_m) OVER (
            PARTITION BY run_id ORDER BY record_timestamp
        ) AS previous_record_distance_m,
        LAG(altitude_m) OVER (
            PARTITION BY run_id ORDER BY record_timestamp
        ) AS previous_altitude_m
    FROM records_with_run_context
)

SELECT
    run_id, record_timestamp,
    CAST(UNIX_TIMESTAMP(record_timestamp)
         - UNIX_TIMESTAMP(first_record_timestamp) AS bigint)
        AS elapsed_seconds,
    CAST(UNIX_TIMESTAMP(record_timestamp)
         - UNIX_TIMESTAMP(previous_record_timestamp) AS bigint)
        AS seconds_since_previous_record,
    record_distance_m, record_distance_km,
    record_distance_m - previous_record_distance_m AS distance_delta_m,
    speed_mps, speed_kmh, pace_min_per_km,
    heart_rate, cadence, running_cadence,
    altitude_m,
    altitude_m - previous_altitude_m AS altitude_delta_m,
    position_lat_deg, position_long_deg,
    CASE WHEN position_lat_deg BETWEEN -90 AND 90
             AND position_long_deg BETWEEN -180 AND 180
        THEN H3_LONGLATASH3(
            position_long_deg, position_lat_deg, 8)
    END AS h3_cell_resolution_8,
    CASE WHEN position_lat_deg BETWEEN -90 AND 90
             AND position_long_deg BETWEEN -180 AND 180
        THEN H3_LONGLATASH3(
            position_long_deg, position_lat_deg, 9)
    END AS h3_cell_resolution_9
FROM sequenced_records`,
    keyTechnique:
      "`lag()` over a partition-by-`run_id` window computes frame-to-frame deltas (distance, altitude) without self-joins. H3 cells use Databricks-native `h3_longlatash3()` — no Python UDFs needed.",
    lineageContext:
      "`run_records` refs `garmin_fit_records` + `runs`. It feeds `mart_activity_records`, `mart_run_segments`, and `route_observations`. It is the sole source of per-record H3 cells.",
  },
  {
    id: "health-days",
    module: "foundation",
    title: "Daily Health Context — health_days",
    context:
      "`health_days` pivots the bronze Garmin Connect health payloads from a narrow " +
      "row-per-endpoint format into a wide daily format using `MAX(CASE WHEN ...)`. One " +
      "row per `calendar_date` with columns for each health metric.\n\n" +
      "Garmin's health API has evolved over time — the JSON structure varies between endpoint " +
      "versions. The model uses `coalesce()` across multiple `get_json_object()` paths to " +
      "handle these variations. For example, resting heart rate can appear at three different " +
      "JSON paths depending on the API version.\n\n" +
      "Sleep timestamps use regex pattern matching (`rlike`) to detect Unix milliseconds (13 " +
      "digits), Unix seconds (10 digits), or ISO timestamps, converting each format " +
      "accordingly. Endpoint availability flags (`has_hrv_payload`, `has_rhr_payload`, etc.) " +
      "make it easy to filter for days with specific data without null-checking every column.",
    sql: `WITH extracted AS (
    SELECT *,
        COALESCE(
            GET_JSON_OBJECT(raw_payload,
                '$.dailySleepDTO.sleepStartTimestampGMT'),
            GET_JSON_OBJECT(raw_payload, '$.sleepStartTimestampGMT'),
            GET_JSON_OBJECT(raw_payload, '$.sleepStartTimeGMT')
        ) AS sleep_start_time_raw,
        COALESCE(
            GET_JSON_OBJECT(raw_payload,
                '$.dailySleepDTO.sleepEndTimestampGMT'),
            GET_JSON_OBJECT(raw_payload, '$.sleepEndTimestampGMT'),
            GET_JSON_OBJECT(raw_payload, '$.sleepEndTimeGMT')
        ) AS sleep_end_time_raw
    FROM {{ source('garmin_raw', 'garmin_health_daily_payloads') }}
),

daily AS (
    SELECT CAST(calendar_date AS date) AS calendar_date,
        MAX(CASE WHEN payload_type = 'hrv' THEN 1 ELSE 0 END) = 1
            AS has_hrv_payload,
        MAX(CASE WHEN payload_type = 'rhr' THEN 1 ELSE 0 END) = 1
            AS has_rhr_payload,
        MAX(CASE WHEN payload_type = 'sleep' THEN 1 ELSE 0 END) = 1
            AS has_sleep_payload,
        MAX(CASE WHEN payload_type = 'heart_rates'
            THEN 1 ELSE 0 END) = 1 AS has_heart_rates_payload,

        -- Resting HR FROM either rhr OR heart_rates endpoint
        MAX(CASE WHEN payload_type = 'rhr'
            THEN TRY_CAST(COALESCE(
                GET_JSON_OBJECT(raw_payload, '$.restingHeartRate'),
                GET_JSON_OBJECT(raw_payload,
                    '$.allMetrics.metricsMap.WELLNESS_RESTING_HEART_RATE'),
                GET_JSON_OBJECT(raw_payload, '$.value')
            ) AS double)
        END) AS rhr_resting_heart_rate,
        MAX(CASE WHEN payload_type = 'heart_rates'
            THEN TRY_CAST(GET_JSON_OBJECT(raw_payload,
                '$.restingHeartRate') AS double)
        END) AS heart_rates_resting_heart_rate,

        -- HRV WITH fallback paths
        MAX(CASE WHEN payload_type = 'hrv'
            THEN TRY_CAST(COALESCE(
                GET_JSON_OBJECT(raw_payload, '$.hrvSummary.lastNightAvg'),
                GET_JSON_OBJECT(raw_payload, '$.hrvSummary.weeklyAvg'),
                GET_JSON_OBJECT(raw_payload, '$.lastNightAvg'),
                GET_JSON_OBJECT(raw_payload, '$.hrvValue')
            ) AS double)
        END) AS hrv_value,

        -- Sleep score WITH nested path variations
        MAX(CASE WHEN payload_type = 'sleep'
            THEN TRY_CAST(COALESCE(
                GET_JSON_OBJECT(raw_payload,
                    '$.dailySleepDTO.sleepScores.overall.value'),
                GET_JSON_OBJECT(raw_payload,
                    '$.dailySleepDTO.sleepScore'),
                GET_JSON_OBJECT(raw_payload, '$.overallSleepScore.value'),
                GET_JSON_OBJECT(raw_payload, '$.sleepScore')
            ) AS double)
        END) AS sleep_score
    FROM extracted GROUP BY CAST(calendar_date AS date)
)

SELECT
    calendar_date,
    COALESCE(rhr_resting_heart_rate,
             heart_rates_resting_heart_rate) AS resting_heart_rate,
    hrv_value, hrv_status, sleep_score, sleep_duration_seconds,
    sleep_start_time, sleep_end_time,
    has_hrv_payload, has_rhr_payload,
    has_sleep_payload, has_heart_rates_payload,
    latest_health_ingested_at,
    latest_health_source_file_modification_time
FROM daily`,
    keyTechnique:
      "`MAX(CASE WHEN payload_type = '...' THEN value END)` pivots multiple narrow rows into a single wide row. `coalesce()` across JSON paths handles Garmin API version drift.",
    lineageContext:
      "`health_days` refs `garmin_health_daily_payloads`. It feeds into `mart_days` via `LEFT JOIN` on `calendar_date`. It is the sole path from raw health JSON into the gold layer.",
  },

  // ── MODULE 2: Daily Foundation ──
  {
    id: "mart-days",
    module: "daily",
    title: "The Unified Daily Mart — mart_days",
    context:
      "`mart_days` is the centerpiece of the entire model. It joins three silver sources — " +
      "the `dates` calendar spine, daily-aggregated `runs`, and `health_days` — into a single " +
      "daily grain table. Every calendar-based analytical output (weeks, months, years) rolls " +
      "up from here.\n\n" +
      "The `LEFT JOIN` pattern is critical: the calendar spine is always preserved, so days " +
      "with no runs and no health data still appear with zero values and null health metrics. " +
      "This ensures window functions compute correctly across date gaps.\n\n" +
      "Training windows use `ROWS BETWEEN` (dense spine — exactly one row per day). Health " +
      "windows use `RANGE BETWEEN INTERVAL` (sparse data — Garmin Connect doesn't always " +
      "return data for every day). The RANGE approach averages over calendar days with " +
      "available data rather than consecutive rows.\n\n" +
      "This is the only model where FIT training data and Garmin Connect health data are " +
      "joined. It provides the authoritative daily state for both analysis and presentation.",
    sql: `WITH dates AS (
    SELECT * FROM {{ ref('dates') }}
),
runs AS (
    SELECT * FROM {{ ref('runs') }}
),
health_days AS (
    SELECT * FROM {{ ref('health_days') }}
),

daily_runs AS (
    SELECT activity_date AS calendar_date,
        COUNT(*) AS run_count,
        SUM(distance_km) AS distance_km,
        SUM(duration_seconds) AS duration_seconds,
        MAX(distance_km) AS long_run_distance_km,
        AVG(avg_heart_rate) AS avg_run_heart_rate,
        CASE WHEN SUM(distance_km) > 0
            THEN SUM(duration_seconds) / 60.0 / SUM(distance_km)
        END AS avg_pace_min_per_km
    FROM runs GROUP BY activity_date
),

days AS (
    SELECT
        dates.calendar_date,
        dates.day_of_week_number, dates.day_of_week_name,
        dates.week_start_date, dates.week_end_date,
        dates.month_start_date, dates.month_end_date,
        dates.calendar_year, dates.is_weekend,
        COALESCE(daily_runs.run_count, 0) AS run_count,
        COALESCE(daily_runs.distance_km, 0.0) AS distance_km,
        COALESCE(daily_runs.duration_seconds, 0.0) AS duration_seconds,
        COALESCE(daily_runs.long_run_distance_km, 0.0)
            AS long_run_distance_km,
        daily_runs.avg_run_heart_rate,
        daily_runs.avg_pace_min_per_km,
        COALESCE(daily_runs.run_count, 0) > 0 AS active_day_flag,
        COALESCE(daily_runs.run_count, 0) = 0 AS missed_day_flag,
        health_days.resting_heart_rate,
        health_days.hrv_value, health_days.hrv_status,
        health_days.sleep_score,
        health_days.sleep_duration_seconds,
        health_days.has_hrv_payload,
        health_days.has_rhr_payload,
        health_days.has_sleep_payload,
        health_days.has_heart_rates_payload
    FROM dates
    LEFT JOIN daily_runs
        ON dates.calendar_date = daily_runs.calendar_date
    LEFT JOIN health_days
        ON dates.calendar_date = health_days.calendar_date
)

SELECT *,
    SUM(run_count) OVER (
        ORDER BY calendar_date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ) AS rolling_7d_run_count,
    SUM(distance_km) OVER (
        ORDER BY calendar_date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ) AS rolling_7d_distance_km,
    SUM(run_count) OVER (
        ORDER BY calendar_date
        ROWS BETWEEN 27 PRECEDING AND CURRENT ROW
    ) AS rolling_28d_run_count,
    SUM(distance_km) OVER (
        ORDER BY calendar_date
        ROWS BETWEEN 27 PRECEDING AND CURRENT ROW
    ) AS rolling_28d_distance_km,
    AVG(resting_heart_rate) OVER (
        ORDER BY CAST(calendar_date AS timestamp)
        RANGE BETWEEN INTERVAL 6 days PRECEDING AND CURRENT ROW
    ) AS rolling_7d_resting_heart_rate,
    AVG(resting_heart_rate) OVER (
        ORDER BY CAST(calendar_date AS timestamp)
        RANGE BETWEEN INTERVAL 29 days PRECEDING AND CURRENT ROW
    ) AS rolling_30d_resting_heart_rate
FROM days`,
    keyTechnique:
      "`LEFT JOIN` preserves the calendar spine. `ROWS BETWEEN` for training windows (dense spine). `RANGE BETWEEN INTERVAL` for health windows (sparse data). Two window strategies in one model.",
    lineageContext:
      "`mart_days` refs `dates` + `runs` + `health_days`. It feeds `mart_weeks`, `mart_months`, `mart_years`, `int_daily_streaks`, `int_current_week_aligned`, and `mart_run_sessions` (for prior training context).",
  },

  // ── MODULE 3: Calendar Rollups ──
  {
    id: "mart-weeks",
    module: "calendar",
    title: "Weekly Rollup — mart_weeks",
    context:
      "`mart_weeks` aggregates `mart_days` into calendar weeks. It handles three edge cases: " +
      "the first historical week may be partial (history starts mid-week), the current week " +
      "is in-progress, and future weeks are discarded.\n\n" +
      "The `active_week_streak` uses a gap-and-islands pattern: a running sum of " +
      "`missed_week_flag` creates a group identifier, then a per-group running count of " +
      "active weeks computes the streak. The final select caps streaks to completed weeks " +
      "only and uses `lag()` to carry forward the last completed streak into the partial " +
      "current week.\n\n" +
      "The model also computes rolling 4-week and 12-week run count and distance windows, " +
      "average pace, average run distance, and the long run's share of weekly volume.",
    sql: `WITH days AS (
    SELECT * FROM {{ ref('mart_days') }}
),

week_bounds AS (
    SELECT MIN(week_start_date) AS first_week_start_date FROM days
),

weekly_all AS (
    SELECT week_start_date, week_end_date,
        COUNT(*) = 7 AS is_completed_week,
        SUM(run_count) AS runs_per_week,
        SUM(distance_km) AS weekly_distance_km,
        SUM(duration_seconds) AS weekly_duration_seconds,
        MAX(long_run_distance_km) AS long_run_distance_km,
        SUM(CASE WHEN active_day_flag THEN 1 ELSE 0 END) AS active_days,
        SUM(CASE WHEN missed_day_flag THEN 1 ELSE 0 END) AS missed_days,
        SUM(run_count) > 0 AND COUNT(*) = 7 AS active_week_flag,
        SUM(run_count) = 0 AND COUNT(*) = 7 AS missed_week_flag,
        COUNT(*) AS completed_day_count
    FROM days GROUP BY week_start_date, week_end_date
),

weekly AS (
    SELECT weekly_all.* FROM weekly_all
    CROSS JOIN week_bounds
    WHERE completed_day_count = 7
       OR week_start_date = first_week_start_date
       OR week_start_date = CAST(
           DATE_TRUNC('week', {{ analytics_current_date() }}) AS date)
),

streak_groups AS (
    SELECT *,
        SUM(CASE WHEN missed_week_flag THEN 1 ELSE 0 END) OVER (
            ORDER BY week_start_date
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS missed_week_group
    FROM weekly
),

weekly_with_windows AS (
    SELECT *,
        SUM(runs_per_week) OVER (ORDER BY week_start_date
            ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
        ) AS rolling_4w_run_count,
        CASE WHEN active_week_flag
            THEN SUM(CASE WHEN active_week_flag THEN 1 ELSE 0 END) OVER (
                PARTITION BY missed_week_group
                ORDER BY week_start_date
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
            ELSE 0
        END AS active_week_streak,
        SUM(CASE WHEN missed_week_flag THEN 1 ELSE 0 END) OVER (
            ORDER BY week_start_date
            ROWS BETWEEN 11 PRECEDING AND CURRENT ROW
        ) AS missed_weeks_12w,
        SUM(weekly_distance_km) OVER (ORDER BY week_start_date
            ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
        ) AS rolling_4w_distance_km,
        SUM(weekly_distance_km) OVER (ORDER BY week_start_date
            ROWS BETWEEN 11 PRECEDING AND CURRENT ROW
        ) AS rolling_12w_distance_km
    FROM streak_groups
)

SELECT
    week_start_date, week_end_date, is_completed_week,
    runs_per_week, weekly_distance_km, weekly_duration_seconds,
    CASE WHEN weekly_distance_km > 0
        THEN weekly_duration_seconds / 60.0 / weekly_distance_km
    END AS avg_pace_min_per_km,
    long_run_distance_km,
    CASE WHEN runs_per_week > 0
        THEN weekly_distance_km / runs_per_week
    END AS avg_run_distance_km,
    CASE WHEN weekly_distance_km > 0
        THEN long_run_distance_km / weekly_distance_km
    END AS long_run_share_of_week,
    active_days, missed_days,
    active_week_flag, missed_week_flag,
    completed_day_count,
    rolling_4w_run_count,
    CASE WHEN is_completed_week THEN active_week_streak
        ELSE LAG(active_week_streak) OVER (ORDER BY week_start_date)
    END AS active_week_streak,
    missed_weeks_12w,
    rolling_4w_distance_km, rolling_12w_distance_km
FROM weekly_with_windows`,
    keyTechnique:
      "Gap-and-islands for streaks: a running sum of `missed_week_flag` creates group identifiers; a per-group sum of `active_week_flag` counts consecutive active weeks within each group.",
    lineageContext:
      "`mart_weeks` refs `mart_days`. It feeds `mart_running_signals` and `mart_weekly_training_features`. It is the gold source for weekly consistency and volume charts.",
  },
  {
    id: "mart-months",
    module: "calendar",
    title: "Monthly Rollup — mart_months",
    context:
      "`mart_months` is a pure aggregation of `mart_days` grouped by `month_start_date`. " +
      "Monthly totals for run count, distance, duration, and active/missed days.\n\n" +
      "Unlike `mart_weeks`, this model carries no rolling windows, streaks, or derived " +
      "metrics. Complex monthly logic belongs in downstream consumers or is derived " +
      "client-side from published `site_days` rows for responsive date-range queries.\n\n" +
      "Monthly and yearly rollups are not exported to Supabase — the Next.js frontend derives " +
      "them from published daily rows.",
    sql: `WITH days AS (
    SELECT * FROM {{ ref('mart_days') }}
)

SELECT
    month_start_date,
    month_end_date,
    calendar_year,
    calendar_month,
    COUNT(*) AS completed_day_count,
    SUM(run_count) AS runs_per_month,
    SUM(distance_km) AS monthly_distance_km,
    SUM(duration_seconds) AS monthly_duration_seconds,
    MAX(long_run_distance_km) AS long_run_distance_km,
    SUM(CASE WHEN active_day_flag THEN 1 ELSE 0 END) AS active_days,
    SUM(CASE WHEN missed_day_flag THEN 1 ELSE 0 END) AS missed_days
FROM days
GROUP BY month_start_date, month_end_date,
         calendar_year, calendar_month`,
    keyTechnique:
      "Pure `GROUP BY` aggregation. The `GROUP BY` clause includes all non-aggregated columns to ensure each month row is uniquely identified by its natural key (`month_start_date`).",
    lineageContext:
      "`mart_months` refs `mart_days`. Not exported to Supabase — months are derived client-side from `site_days`. Used in Databricks for offline volume analysis.",
  },
  {
    id: "mart-years",
    module: "calendar",
    title: "Yearly Rollup — mart_years",
    context:
      "Same aggregation pattern as `mart_months`, grouped by `calendar_year`. Provides annual " +
      "totals for run count, distance, duration, and active/missed days.\n\n" +
      "Years may be partial (the current year is included even if incomplete), allowing " +
      "year-to-date comparisons without special handling. Like `mart_months`, this model is " +
      "intentionally minimal — coarse rollups are derived from the daily foundation rather " +
      "than carrying independent business logic.",
    sql: `WITH days AS (
    SELECT * FROM {{ ref('mart_days') }}
)

SELECT
    year_start_date,
    year_end_date,
    calendar_year,
    COUNT(*) AS completed_day_count,
    SUM(run_count) AS runs_per_year,
    SUM(distance_km) AS yearly_distance_km,
    SUM(duration_seconds) AS yearly_duration_seconds,
    MAX(long_run_distance_km) AS long_run_distance_km,
    SUM(CASE WHEN active_day_flag THEN 1 ELSE 0 END) AS active_days,
    SUM(CASE WHEN missed_day_flag THEN 1 ELSE 0 END) AS missed_days
FROM days
GROUP BY year_start_date, year_end_date, calendar_year`,
    keyTechnique:
      "Identical aggregation pattern to `mart_months`, demonstrating that rollup models share a common structure derived from `mart_days`.",
    lineageContext:
      "`mart_years` refs `mart_days`. Not exported to Supabase. Serves as the annual rollup for volume trend analysis in Databricks.",
  },

  // ── MODULE 4: Intermediates ──
  {
    id: "int-daily-streaks",
    module: "intermediates",
    title: "Gap-and-Island Streaks — int_daily_streaks",
    context:
      "`int_daily_streaks` computes four single-row aggregates from `mart_days`: longest " +
      "daily run streak, average daily run streak, longest training break, and average break " +
      "length. It uses the classic gap-and-islands pattern on `active_day_flag`.\n\n" +
      "Three CTEs implement the algorithm: `streak_groups` detects transitions with `lag()`, " +
      "`numbered_groups` assigns group identifiers via a running sum, and `region_lengths` " +
      "measures each contiguous region. `is_run_region` is determined by `MAX(active_day_flag)` " +
      "within each group — a region is a run streak if any day in it was active.\n\n" +
      "The final `SELECT` uses conditional aggregation within a single row: " +
      "`MAX(CASE WHEN is_run_region THEN region_length END)` for the longest streak, " +
      "`AVG(CASE WHEN ...)` for averages. The output is a single row with four columns, " +
      "useful for dashboard summary metrics.",
    sql: `WITH ordered_days AS (
    SELECT calendar_date, active_day_flag
    FROM {{ ref('mart_days') }}
),

streak_groups AS (
    SELECT calendar_date, active_day_flag,
        active_day_flag
            AND (LAG(active_day_flag) OVER (
                ORDER BY calendar_date) IS NOT TRUE
                OR LAG(active_day_flag) OVER (
                    ORDER BY calendar_date) IS NULL)
            AS is_streak_start,
        NOT active_day_flag
            AND LAG(active_day_flag) OVER (
                ORDER BY calendar_date) IS TRUE
            AS is_break_start
    FROM ordered_days
),

numbered_groups AS (
    SELECT calendar_date, active_day_flag,
        SUM(CASE WHEN is_streak_start OR is_break_start
            THEN 1 ELSE 0 END)
        OVER (ORDER BY calendar_date) AS region_group
    FROM streak_groups
),

region_lengths AS (
    SELECT region_group,
        MAX(active_day_flag) AS is_run_region,
        COUNT(*) AS region_length
    FROM numbered_groups
    GROUP BY region_group
)

SELECT
    MAX(CASE WHEN is_run_region
        THEN region_length ELSE 0 END)
        AS longest_daily_run_streak,
    AVG(CASE WHEN is_run_region
        THEN region_length * 1.0 END)
        AS average_daily_run_streak,
    MAX(CASE WHEN NOT is_run_region
        THEN region_length ELSE 0 END)
        AS longest_training_break,
    AVG(CASE WHEN NOT is_run_region
        THEN region_length * 1.0 END)
        AS average_break_length
FROM region_lengths`,
    keyTechnique:
      "Gap-and-islands: `lag()` detects transitions, running sum of transitions creates group IDs, `GROUP BY` region groups computes lengths. Conditional `MAX`/`AVG` in final `SELECT` produces a single-row output.",
    lineageContext:
      "`int_daily_streaks` refs `mart_days`. A single-row aggregate model. Not exported to Supabase — used for dashboard summary metrics in Databricks.",
  },
  {
    id: "int-current-week-aligned",
    module: "intermediates",
    title: "Current Week Context — int_current_week_aligned",
    context:
      "`int_current_week_aligned` provides a single-row aggregate of the current ISO " +
      "week-to-date. It filters `mart_days` to the current week up to today's date.\n\n" +
      "The key constraint: only completed days are included (`calendar_date <= " +
      "{{ analytics_current_date() }}`), preventing today's in-progress data from " +
      "appearing as a completed observation. The `days_so_far` column reports how many " +
      "days of the current week have elapsed, enabling week-to-date progress.\n\n" +
      "This model is materialized as a **view** rather than a table, so it always reflects " +
      "the latest state. `coalesce()` prevents null output on weeks with no runs yet.",
    sql: `WITH current_week_boundaries AS (
    SELECT
        DATE_TRUNC('week', {{ analytics_current_date() }})
            AS week_start_date,
        DATE_TRUNC('week', {{ analytics_current_date() }})
            + INTERVAL 6 days AS week_end_date
),

current_week_days AS (
    SELECT days.*
    FROM {{ ref('mart_days') }} AS days
    CROSS JOIN current_week_boundaries AS boundaries
    WHERE days.calendar_date >= boundaries.week_start_date
      AND days.calendar_date <= boundaries.week_end_date
      AND days.calendar_date <= {{ analytics_current_date() }}
)

SELECT
    CAST(DATE_TRUNC('week', {{ analytics_current_date() }})
        AS date) AS week_start_date,
    CAST(MAX(calendar_date) AS date) AS latest_completed_date,
    COALESCE(SUM(run_count), 0) AS run_count,
    COALESCE(SUM(distance_km), 0) AS distance_km,
    COALESCE(SUM(CASE WHEN active_day_flag
        THEN 1 ELSE 0 END), 0) AS active_days,
    DATEDIFF(
        {{ analytics_current_date() }},
        CAST(DATE_TRUNC('week', {{ analytics_current_date() }})
            AS date)
    ) + 1 AS days_so_far
FROM current_week_days`,
    keyTechnique:
      "Current week filtering via `date_trunc` + `{{ analytics_current_date() }}`. `materialized='view'` ensures always-fresh results. `coalesce()` prevents null output on weeks with no runs.",
    lineageContext:
      "`int_current_week_aligned` refs `mart_days`. Materialized as a view for real-time current-week state. Used by dashboard widgets.",
  },

  // ── MODULE 5: Within-Run Analytics ──
  {
    id: "mart-segment-resolutions",
    module: "within-run",
    title: "Segment Configuration — mart_segment_resolutions",
    context:
      "`mart_segment_resolutions` is a static seed model with exactly 6 rows defining the " +
      "segment lengths used for within-run analytical splits.\n\n" +
      "The canonical 250m metric resolution (`unit_system = 'metric'`, `is_canonical = true`) " +
      "is used by session-level and fitness calculations downstream. Imperial resolutions " +
      "exist for display purposes but are not used in core signal calculations.\n\n" +
      "Adding a new resolution requires adding a new `UNION ALL` row — the segment allocation " +
      "engine in `mart_run_segments` cross-joins with this table, so new resolutions " +
      "automatically produce splits at the new length without any model redesign.",
    sql: `SELECT 'metric' AS unit_system,
    CAST(0.25 AS decimal(4, 2)) AS segment_length_value,
    CAST(250.000 AS decimal(10, 3)) AS segment_length_m,
    '250 m' AS segment_length_label,
    TRUE AS is_canonical

UNION ALL

SELECT 'metric', 0.50, 500.000, '500 m', FALSE
UNION ALL
SELECT 'metric', 1.00, 1000.000, '1 km', FALSE
UNION ALL
SELECT 'imperial', 0.25, 402.336, '0.25 mi', FALSE
UNION ALL
SELECT 'imperial', 0.50, 804.672, '0.5 mi', FALSE
UNION ALL
SELECT 'imperial', 1.00, 1609.344, '1 mi', FALSE`,
    keyTechnique:
      "Static seed tables replace dbt `seed` CSV files for Databricks compatibility. `UNION ALL` with explicit casting ensures stable decimal precision across all rows.",
    lineageContext:
      "`mart_segment_resolutions` is the only gold model with no upstream refs. It feeds `mart_run_segments`. Segment resolution is additive: new rows produce new splits without model changes.",
  },
  {
    id: "mart-run-segments-pt1",
    module: "within-run",
    title: "Part 1: Record Intervals & Boundaries — mart_run_segments",
    context:
      "`mart_run_segments` is the most complex model in the project. This first half covers " +
      "monotonic distance correction, sequencing telemetry, and generating segment boundaries.\n\n" +
      "A running maximum (`GREATEST(MAX(...) OVER ...)`) forces cumulative distance to be " +
      "monotonic, correcting for GPS source corrections where the device reports a temporarily " +
      "lower distance. Eight `LAG()` columns pull the previous record's timestamp, heart rate, " +
      "cadence, altitude, coordinates, and H3 cells into the current row.\n\n" +
      "Segment boundaries are generated with a bounded `SEQUENCE(1, CEIL(distance / length))` " +
      "so each run only produces the segments it needs — no wasteful cross-join to 500km. " +
      "Part 2 covers the allocation of each record interval across all crossed segment boundaries.",
    sql: `WITH resolutions AS (
    SELECT * FROM {{ ref('mart_segment_resolutions') }}
),

distance_records AS (
    SELECT *,
        GREATEST(MAX(record_distance_m) OVER (
            PARTITION BY run_id ORDER BY record_index
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ), 0.0) AS analysis_distance_m
    FROM {{ ref('run_records') }}
    WHERE record_distance_m IS NOT NULL
),

records_with_previous AS (
    SELECT *,
        LAG(analysis_distance_m) OVER (
            PARTITION BY run_id ORDER BY record_index
        ) AS previous_analysis_distance_m,
        LAG(record_timestamp) OVER (
            PARTITION BY run_id ORDER BY record_index
        ) AS previous_record_timestamp,
        LAG(heart_rate) OVER (
            PARTITION BY run_id ORDER BY record_index
        ) AS previous_heart_rate,
        LAG(running_cadence) OVER (
            PARTITION BY run_id ORDER BY record_index
        ) AS previous_running_cadence,
        LAG(altitude_m) OVER (
            PARTITION BY run_id ORDER BY record_index
        ) AS previous_altitude_m,
        LAG(position_lat_deg) OVER (
            PARTITION BY run_id ORDER BY record_index
        ) AS previous_latitude_deg,
        LAG(position_long_deg) OVER (
            PARTITION BY run_id ORDER BY record_index
        ) AS previous_longitude_deg,
        LAG(h3_cell_resolution_8) OVER (
            PARTITION BY run_id ORDER BY record_index
        ) AS previous_h3_cell_resolution_8,
        LAG(h3_cell_resolution_9) OVER (
            PARTITION BY run_id ORDER BY record_index
        ) AS previous_h3_cell_resolution_9
    FROM distance_records
),

record_intervals AS (
    SELECT *,
        COALESCE(previous_analysis_distance_m, 0.0)
            AS interval_start_distance_m,
        analysis_distance_m AS interval_end_distance_m,
        analysis_distance_m
            - COALESCE(previous_analysis_distance_m, 0.0)
            AS interval_distance_m,
        COALESCE(previous_record_timestamp, record_timestamp)
            AS interval_start_timestamp,
        record_timestamp AS interval_end_timestamp,
        GREATEST(CAST(UNIX_TIMESTAMP(record_timestamp)
            - UNIX_TIMESTAMP(COALESCE(previous_record_timestamp,
                record_timestamp)) AS double), 0.0)
            AS interval_duration_seconds
    FROM records_with_previous
),

run_distance_extents AS (
    SELECT run_id, activity_id, activity_date,
        MAX(analysis_distance_m) AS activity_distance_m
    FROM distance_records
    GROUP BY run_id, activity_id, activity_date
),

configured_segments AS (
    SELECT
        extents.run_id, extents.activity_id,
        extents.activity_date,
        resolutions.unit_system,
        resolutions.segment_length_value,
        resolutions.segment_length_m,
        resolutions.segment_length_label,
        resolutions.is_canonical,
        segment_index,
        (segment_index - 1) * resolutions.segment_length_m
            AS segment_start_boundary_m,
        segment_index * resolutions.segment_length_m
            AS segment_end_boundary_m
    FROM run_distance_extents AS extents
    CROSS JOIN resolutions
    LATERAL VIEW EXPLODE(SEQUENCE(
        1, GREATEST(CAST(CEIL(
            extents.activity_distance_m
            / resolutions.segment_length_m) AS int), 1)
    )) exploded AS segment_index
),

-- ...continued in Part 2...`,
    keyTechnique:
      "Running-maximum monotonic correction + eight `LAG()` columns for interpolation state. Segment generation uses `CEIL(distance / length)` to bound the `SEQUENCE` per-run, avoiding wasteful pre-generation.",
    lineageContext:
      "`mart_run_segments` refs `run_records` + `mart_segment_resolutions`. It is the heaviest model by compute — cross-joining every run with every resolution.",
  },
  {
    id: "mart-run-segments-pt2",
    module: "within-run",
    title: "Part 2: Segment Allocation & Telemetry — mart_run_segments",
    context:
      "The second half performs the actual segment allocation: for each record interval, " +
      "determine which boundaries it crosses, then proportionally allocate distance, duration, " +
      "heart rate, cadence, altitude, and coordinates.\n\n" +
      "The core idea: if a record interval spans from 120m to 380m and crosses the 250m " +
      "boundary, the portion from 120m to 250m (130m, 50% of the interval) belongs to " +
      "segment 1, and the portion from 250m to 380m (130m, 50%) belongs to segment 2. " +
      "Duration, heart rate, and cadence are split by the same proportion. Telemetry values " +
      "are linearly interpolated at the boundary and weighted by distance.\n\n" +
      "The canonical 250m metric resolution (`is_canonical = true`) is used by " +
       "`mart_fitness` for aerobic decoupling and efficiency calculations. Segment distance " +
      "reconciliation tests validate that the sum of allocated distances matches the run's " +
      "total recorded distance — no distance is lost or double-counted.",
    sql: `-- (continued from Part 1)...

interval_segment_matches AS (
    SELECT
        segments.*,
        intervals.record_index,
        intervals.interval_start_distance_m,
        intervals.interval_end_distance_m,
        intervals.interval_distance_m,
        intervals.interval_duration_seconds,
        intervals.previous_heart_rate,
        intervals.heart_rate,
        intervals.previous_running_cadence,
        intervals.running_cadence,
        intervals.previous_altitude_m,
        intervals.altitude_m,
        intervals.previous_latitude_deg,
        intervals.position_lat_deg,
        intervals.previous_longitude_deg,
        intervals.position_long_deg,
        intervals.previous_h3_cell_resolution_8,
        intervals.h3_cell_resolution_8,
        intervals.previous_h3_cell_resolution_9,
        intervals.h3_cell_resolution_9
    FROM configured_segments AS segments
    INNER JOIN record_intervals AS intervals
        ON segments.run_id = intervals.run_id
            AND (
                (intervals.interval_distance_m > 0
                 AND intervals.interval_end_distance_m
                     > segments.segment_start_boundary_m
                 AND intervals.interval_start_distance_m
                     < segments.segment_end_boundary_m)
                OR (intervals.interval_distance_m = 0
                    AND segments.segment_index = GREATEST(
                        CAST(CEIL(intervals.interval_end_distance_m
                            / segments.segment_length_m) AS int), 1))
            )
),

allocated_intervals AS (
    SELECT *,
        CASE WHEN interval_distance_m > 0
            THEN GREATEST(interval_start_distance_m,
                          segment_start_boundary_m)
            ELSE interval_end_distance_m
        END AS allocated_start_distance_m,
        CASE WHEN interval_distance_m > 0
            THEN LEAST(interval_end_distance_m,
                       segment_end_boundary_m)
            ELSE interval_end_distance_m
        END AS allocated_end_distance_m
    FROM interval_segment_matches
),

allocation_fractions AS (
    SELECT *,
        allocated_end_distance_m - allocated_start_distance_m
            AS allocated_distance_m,
        CASE WHEN interval_distance_m > 0
            THEN (allocated_start_distance_m
                  - interval_start_distance_m)
                 / interval_distance_m
            ELSE 0.0
        END AS allocation_start_fraction,
        CASE WHEN interval_distance_m > 0
            THEN (allocated_end_distance_m
                  - interval_start_distance_m)
                 / interval_distance_m
            ELSE 1.0
        END AS allocation_end_fraction
    FROM allocated_intervals
),

allocation_values AS (
    SELECT *,
        (allocation_start_fraction + allocation_end_fraction) / 2.0
            AS allocation_midpoint_fraction
    FROM allocation_fractions
),

interpolated_allocations AS (
    SELECT *,
        -- Interpolated heart rate, cadence, altitude, coordinates
        -- using linear interpolation weighted by allocation fractions.
        -- Interpolated start/end timestamps from interval boundaries.
        CASE WHEN previous_heart_rate IS NOT NULL
                  AND heart_rate IS NOT NULL
            THEN previous_heart_rate
                 + (heart_rate - previous_heart_rate)
                   * allocation_midpoint_fraction
            ELSE COALESCE(heart_rate, previous_heart_rate)
        END AS allocated_heart_rate,
        CASE WHEN previous_running_cadence IS NOT NULL
                  AND running_cadence IS NOT NULL
            THEN previous_running_cadence
                 + (running_cadence - previous_running_cadence)
                   * allocation_midpoint_fraction
            ELSE COALESCE(running_cadence, previous_running_cadence)
        END AS allocated_running_cadence,
        CASE WHEN previous_altitude_m IS NOT NULL
                  AND altitude_m IS NOT NULL
            THEN previous_altitude_m
                 + (altitude_m - previous_altitude_m)
                   * allocation_start_fraction
            ELSE COALESCE(previous_altitude_m, altitude_m)
        END AS allocated_start_altitude_m,
        CASE WHEN previous_altitude_m IS NOT NULL
                  AND altitude_m IS NOT NULL
            THEN previous_altitude_m
                 + (altitude_m - previous_altitude_m)
                   * allocation_end_fraction
            ELSE COALESCE(altitude_m, previous_altitude_m)
        END AS allocated_end_altitude_m,
        CASE WHEN previous_latitude_deg IS NOT NULL
                  AND position_lat_deg IS NOT NULL
            THEN previous_latitude_deg
                 + (position_lat_deg - previous_latitude_deg)
                   * allocation_start_fraction
            ELSE COALESCE(previous_latitude_deg, position_lat_deg)
        END AS allocated_start_latitude_deg,
        CASE WHEN previous_latitude_deg IS NOT NULL
                  AND position_lat_deg IS NOT NULL
            THEN previous_latitude_deg
                 + (position_lat_deg - previous_latitude_deg)
                   * allocation_end_fraction
            ELSE COALESCE(position_lat_deg, previous_latitude_deg)
        END AS allocated_end_latitude_deg,
        CASE WHEN previous_longitude_deg IS NOT NULL
                  AND position_long_deg IS NOT NULL
            THEN previous_longitude_deg
                 + (position_long_deg - previous_longitude_deg)
                   * allocation_start_fraction
            ELSE COALESCE(previous_longitude_deg, position_long_deg)
        END AS allocated_start_longitude_deg,
        CASE WHEN previous_longitude_deg IS NOT NULL
                  AND position_long_deg IS NOT NULL
            THEN previous_longitude_deg
                 + (position_long_deg - previous_longitude_deg)
                   * allocation_end_fraction
            ELSE COALESCE(position_long_deg, previous_longitude_deg)
        END AS allocated_end_longitude_deg,
        CASE WHEN interval_duration_seconds > 0
            THEN interval_duration_seconds
            WHEN interval_distance_m > 0
            THEN interval_distance_m
            ELSE 1.0
        END AS telemetry_weight
    FROM allocation_values
),

segment_rollups AS (
    SELECT
        run_id, activity_id, activity_date,
        unit_system, segment_length_value,
        segment_length_m, segment_length_label,
        is_canonical, segment_index,
        segment_start_boundary_m,
        segment_end_boundary_m,
        SUM(allocated_distance_m) AS segment_distance_m,
        SUM(CASE WHEN interval_duration_seconds > 0
            THEN (allocated_distance_m / interval_distance_m)
                 * interval_duration_seconds
            ELSE interval_duration_seconds END
        ) AS segment_duration_seconds,
        SUM(allocated_heart_rate * telemetry_weight)
            / NULLIF(SUM(CASE WHEN allocated_heart_rate IS NOT NULL
                THEN telemetry_weight END), 0.0) AS avg_heart_rate,
        MAX(GREATEST(allocated_start_heart_rate,
                     allocated_end_heart_rate)) AS max_heart_rate,
        SUM(allocated_running_cadence * telemetry_weight)
            / NULLIF(SUM(CASE
                WHEN allocated_running_cadence IS NOT NULL
                THEN telemetry_weight END), 0.0)
            AS avg_running_cadence,
        MIN(LEAST(allocated_start_altitude_m,
                  allocated_end_altitude_m)) AS min_altitude_m,
        MAX(GREATEST(allocated_start_altitude_m,
                     allocated_end_altitude_m)) AS max_altitude_m,
        MIN_BY(allocated_start_altitude_m,
               allocated_start_distance_m) AS segment_start_altitude_m,
        MAX_BY(allocated_end_altitude_m,
               allocated_end_distance_m) AS segment_end_altitude_m,
        MIN_BY(allocated_start_latitude_deg,
               allocated_start_distance_m)
            AS segment_start_latitude_deg,
        MIN_BY(allocated_start_longitude_deg,
               allocated_start_distance_m)
            AS segment_start_longitude_deg,
        MAX_BY(allocated_end_latitude_deg,
               allocated_end_distance_m)
            AS segment_end_latitude_deg,
        MAX_BY(allocated_end_longitude_deg,
               allocated_end_distance_m)
            AS segment_end_longitude_deg,
        MIN_BY(COALESCE(previous_h3_cell_resolution_8,
                        h3_cell_resolution_8),
               allocated_start_timestamp)
            AS start_h3_cell_resolution_8,
        MAX_BY(COALESCE(h3_cell_resolution_8,
                        previous_h3_cell_resolution_8),
               allocated_end_timestamp)
            AS end_h3_cell_resolution_8,
        MIN_BY(COALESCE(h3_cell_resolution_8,
                        previous_h3_cell_resolution_8),
               allocated_start_distance_m)
            AS representative_h3_cell_resolution_8,
        MIN_BY(COALESCE(h3_cell_resolution_9,
                        previous_h3_cell_resolution_9),
               allocated_start_distance_m)
            AS representative_h3_cell_resolution_9,
        COUNT(DISTINCT record_index) AS record_count
    FROM interpolated_allocations
    GROUP BY run_id, activity_id, activity_date,
        unit_system, segment_length_value,
        segment_length_m, segment_length_label,
        is_canonical, segment_index,
        segment_start_boundary_m, segment_end_boundary_m
)

SELECT
    run_id, activity_id, activity_date,
    unit_system, segment_length_value,
    segment_length_m, segment_length_label,
    is_canonical, segment_index,
    segment_start_boundary_m, segment_end_boundary_m,
    segment_distance_m,
    segment_distance_m / 1000.0 AS segment_distance_km,
    segment_duration_seconds,
    CASE WHEN segment_distance_m > 0
        THEN segment_duration_seconds / 60.0
             / (segment_distance_m / 1000.0)
    END AS segment_pace_min_per_km,
    CASE WHEN segment_duration_seconds > 0
        THEN segment_distance_m / segment_duration_seconds * 3.6
    END AS avg_speed_kmh,
    avg_heart_rate, max_heart_rate, avg_running_cadence,
    min_altitude_m, max_altitude_m,
    segment_end_altitude_m - segment_start_altitude_m
        AS elevation_change_m,
    CASE WHEN segment_distance_m > 0
        THEN (segment_end_altitude_m - segment_start_altitude_m)
             / segment_distance_m
    END AS segment_grade,
    segment_start_latitude_deg, segment_start_longitude_deg,
    segment_end_latitude_deg, segment_end_longitude_deg,
    start_h3_cell_resolution_8, end_h3_cell_resolution_8,
    representative_h3_cell_resolution_8,
    representative_h3_cell_resolution_9,
    record_count
FROM segment_rollups`,
    keyTechnique:
      "Distance-proportional allocation with interpolation: `GREATEST(0, LEAST(end, upper) - GREATEST(start, lower))` computes interval/segment overlap. Telemetry values (HR, cadence, altitude, lat/lon) are linearly interpolated at boundaries. Stationary intervals are assigned entirely to their containing segment.",
    lineageContext:
       "`mart_run_segments` provides canonical 250m quality checks for aerobic decoupling and feeds `mart_run_sessions` (segment summary). It is synced to Supabase as `site_route_segments`.",
  },
  {
    id: "mart-activity-records",
    module: "within-run",
    title: "Presentation Telemetry — mart_activity_records",
    context:
      "`mart_activity_records` is a straightforward projection of `run_records` into a " +
      "presentation-safe format. It selects a curated subset of columns, removing internal " +
      "fields like H3 cells, WKT geometry, and source metadata.\n\n" +
      "Every record is retained, including rows without GPS coordinates. This preserves " +
      "ordering and avoids the complexity of reconnecting separate GPS sequences across gaps. " +
      "Consumers filter for GPS-backed records when they need map geometry.\n\n" +
      "The key difference from `run_records`: this model uses `record_index` as its key " +
      "(rather than `record_timestamp`), establishing a deterministic, gap-free ordering " +
      "for presentation consumers.",
    sql: `SELECT
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
FROM {{ ref('run_records') }}`,
    keyTechnique:
      "A projection (not a transformation): `SELECT` with an explicit column list narrows the silver model's wide output to presentation-relevant columns. No aggregation, no joins.",
    lineageContext:
      "`mart_activity_records` refs `run_records`. It feeds `mart_map_profile_records`. Not exported to Supabase — full telemetry stays in Databricks. Only the 500-point sample is served to the site.",
  },
  {
    id: "mart-map-profile-records",
    module: "within-run",
    title: "Deterministic Map Sampling — mart_map_profile_records",
    context:
      "`mart_map_profile_records` reduces telemetry records down to at most 500 ordered " +
      "points per run for the Supabase presentation layer.\n\n" +
      "The sampling is deterministic: for runs with more than 500 records, it evenly " +
      "distributes 500 sample positions so the first and last records are always included. " +
      "Runs with 500 or fewer records retain every row unchanged, ensuring short runs have " +
      "full fidelity while long runs are compressed.\n\n" +
      "The model includes pace and heart rate columns (added in a later migration) for the " +
      "elevation profile tooltip. Sampling happens in `mart_activity_records`, keeping the " +
      "downsampling logic in one place.",
    sql: `WITH ordered_records AS (
    SELECT
        run_id, record_index,
        record_distance_km, altitude_m,
        pace_min_per_km, heart_rate,
        position_lat_deg, position_long_deg,
        ROW_NUMBER() OVER (
            PARTITION BY run_id ORDER BY record_index
        ) AS record_order,
        COUNT(*) OVER (PARTITION BY run_id) AS record_count
    FROM {{ ref('mart_activity_records') }}
),

sample_offsets AS (
    SELECT EXPLODE(SEQUENCE(0, 499)) AS sample_index
),

sampled_records AS (
    -- Runs WITH <= 500 records: keep ALL
    SELECT
        run_id, record_index, record_distance_km,
        altitude_m, pace_min_per_km, heart_rate,
        position_lat_deg, position_long_deg
    FROM ordered_records
    WHERE record_count <= 500

    UNION ALL

    -- Runs WITH > 500 records: deterministic 500-point sample
    SELECT
        records.run_id, records.record_index,
        records.record_distance_km, records.altitude_m,
        records.pace_min_per_km, records.heart_rate,
        records.position_lat_deg, records.position_long_deg
    FROM ordered_records AS records
    INNER JOIN sample_offsets
        ON records.record_order = CAST(
            FLOOR(sample_offsets.sample_index
                * (records.record_count - 1) / 499.0) AS bigint
        ) + 1
    WHERE records.record_count > 500
)

SELECT *
FROM sampled_records`,
    keyTechnique:
      "Deterministic uniform sampling: `floor(i * (N-1) / 499)` ensures first point (`i=0`) and last point (`i=499`) are always included, while intermediate points are evenly spaced.",
    lineageContext:
      "`mart_map_profile_records` refs `mart_activity_records`. Exported to Supabase as `site_map_profile_records`. Used by route maps and the elevation profile tooltip.",
  },
  {
    id: "signal-fitness",
    module: "within-run",
    title: "Aerobic Fitness Indicators — mart_fitness",
    context:
      "`mart_fitness` defines descriptive aerobic fitness indicators at the run grain: " +
       "quality-gated aerobic decoupling and speed-to-heart-rate efficiency ratios.\n\n" +
        "Aerobic decoupling uses FIT timer-running record intervals rather than elapsed fixed-distance splits. " +
        "Timer events identify pauses, while timer-running intervals retain their duration even when a record " +
        "reports no distance change. The cumulative timer-running-distance midpoint divides the run into first and second allocations; " +
        "an interval crossing that midpoint is split proportionally. Each half has a timer-running " +
        "efficiency, and a positive `aerobic_decoupling_pct` means lower second-half efficiency.\n\n" +
        "A quality status protects the comparison by reconciling timer events to Garmin's session timer, " +
        "then requiring sufficient timer-running duration, distance, interval coverage, heart-rate coverage, and no excessive record gaps.",
    sql: `WITH timer_event_sequence AS (
    SELECT
        run_id,
        CAST(timestamp AS timestamp) AS event_timestamp,
        event_type,
        LEAD(CAST(timestamp AS timestamp)) OVER timer_events AS next_event_timestamp,
        LEAD(event_type) OVER timer_events AS next_event_type
    FROM {{ source('garmin_raw', 'garmin_fit_events') }}
    WHERE event = 'timer'
    WINDOW timer_events AS (
        PARTITION BY run_id
        ORDER BY CAST(timestamp AS timestamp)
    )
),

timer_windows AS (
    SELECT
        run_id,
        event_timestamp AS timer_start_timestamp,
        next_event_timestamp AS timer_end_timestamp
    FROM timer_event_sequence
    WHERE event_type = 'start'
        AND next_event_type IN ('stop', 'stop_all', 'stop_disable', 'stop_disable_all')
),

record_intervals AS (
    SELECT
        run_id,
        record_index,
        record_timestamp,
        LAG(record_timestamp) OVER run_records AS interval_start_timestamp,
        GREATEST(record_distance_m
            - LAG(record_distance_m) OVER run_records, 0.0) AS interval_distance_m,
        GREATEST(CAST(
            UNIX_TIMESTAMP(record_timestamp)
            - UNIX_TIMESTAMP(LAG(record_timestamp) OVER run_records)
            AS double
        ), 0.0) AS interval_duration_seconds,
        (heart_rate + LAG(heart_rate) OVER run_records) / 2.0
            AS interval_heart_rate
    FROM {{ ref('run_records') }}
    WINDOW run_records AS (
        PARTITION BY run_id ORDER BY record_index
    )
),

timer_intervals AS (
    SELECT
        intervals.*,
        SUM(GREATEST(
            LEAST(UNIX_TIMESTAMP(intervals.record_timestamp), UNIX_TIMESTAMP(windows.timer_end_timestamp))
                - GREATEST(UNIX_TIMESTAMP(intervals.interval_start_timestamp), UNIX_TIMESTAMP(windows.timer_start_timestamp)),
            0.0
        )) AS timer_running_duration_seconds
    FROM record_intervals AS intervals
    INNER JOIN timer_windows AS windows
        ON intervals.run_id = windows.run_id
            AND intervals.interval_start_timestamp < windows.timer_end_timestamp
            AND intervals.record_timestamp > windows.timer_start_timestamp
    GROUP BY ALL
),

timer_running_output AS (
    SELECT
        run_id,
        SUM(interval_distance_m * timer_running_duration_seconds
            / NULLIF(interval_duration_seconds, 0.0)) AS timer_running_distance_m,
        SUM(timer_running_duration_seconds) AS timer_running_duration_seconds,
        SUM(interval_heart_rate * timer_running_duration_seconds)
            / NULLIF(SUM(CASE WHEN interval_heart_rate > 0 THEN timer_running_duration_seconds END), 0.0)
            AS timer_running_avg_heart_rate
    FROM timer_intervals
    GROUP BY run_id
)

SELECT
    *
FROM timer_running_output`,
    keyTechnique:
      "Build timer-running windows from FIT events, then intersect every record interval with those windows. This preserves timer-running zero-distance records and excludes pauses before allocating the midpoint-crossing interval by distance. Compute each half's timer-running speed-to-heart-rate efficiency only for quality-passing runs; `first_half_efficiency / second_half_efficiency - 1` makes deterioration positive.",
     lineageContext:
       "`mart_fitness` refs `runs`, `mart_run_aerobic_decoupling`, and record-level economy metrics. It feeds `mart_running_signals`. Exported to Supabase as `site_fitness_core`. The most analytically sophisticated signal model.",
  },

  // ── MODULE 6: Route Analytics ──
  {
    id: "route-observations",
    module: "route",
    title: "H3 Path Signatures — route_observations",
    context:
      "`route_observations` converts each GPS-backed run into a compact H3 path signature " +
      "for route similarity comparison. It groups telemetry records into 250-metre floor " +
      "buckets, extracts a representative H3 cell per bucket, and builds an ordered path " +
      "as an `ARRAY` of H3 cells.\n\n" +
      "The 250m bucket size is a legacy choice that predates the configurable segment " +
      "resolution system. It balances route discrimination (small enough to capture shape) " +
      "with noise tolerance (large enough to absorb GPS jitter). H3 resolution 8 (~0.7 km²) " +
      "is used for similarity comparison; resolution 9 (~0.1 km²) for the stable `route_id` hash.\n\n" +
      "The representative cell within each bucket is the lowest-distance record, with " +
      "`record_index` as a deterministic tie-breaker. `route_observations` is materialized " +
      "as a table — it feeds a heavy self-join in `route_similarity_edges`.",
    sql: `WITH legacy_route_records AS (
    SELECT run_id,
        CAST(FLOOR(record_distance_m / 250.0) AS int) + 1
            AS segment_index,
        h3_cell_resolution_8, h3_cell_resolution_9,
        ROW_NUMBER() OVER (
            PARTITION BY run_id,
                CAST(FLOOR(record_distance_m / 250.0) AS int) + 1
            ORDER BY record_distance_m, record_index
        ) AS representative_rank
    FROM {{ ref('run_records') }}
    WHERE record_distance_m IS NOT NULL
),

legacy_route_segments AS (
    SELECT run_id, segment_index,
        MAX(CASE WHEN representative_rank = 1
            THEN h3_cell_resolution_8 END)
            AS representative_h3_cell_resolution_8,
        MAX(CASE WHEN representative_rank = 1
            THEN h3_cell_resolution_9 END)
            AS representative_h3_cell_resolution_9
    FROM legacy_route_records
    GROUP BY run_id, segment_index
),

route_cells AS (
    SELECT
        runs.run_id, runs.activity_id,
        runs.activity_date, runs.distance_km,
        segments.segment_index,
        CAST(segments.representative_h3_cell_resolution_8
            AS string) AS h3_cell_resolution_8,
        CAST(segments.representative_h3_cell_resolution_9
            AS string) AS h3_cell_resolution_9
    FROM legacy_route_segments AS segments
    INNER JOIN {{ ref('runs') }} AS runs
        ON segments.run_id = runs.run_id
    WHERE segments.representative_h3_cell_resolution_8 IS NOT NULL
        AND segments.representative_h3_cell_resolution_9 IS NOT NULL
        AND runs.distance_km IS NOT NULL
        AND runs.distance_km > 0
),

route_observations AS (
    SELECT runs.run_id,
        runs.activity_id, runs.activity_date,
        runs.distance_km,
        round(distance_km * 2.0) / 2.0
            AS route_distance_bucket_km,
        min_by(h3_cell_resolution_9, segment_index)
            AS start_h3_cell_resolution_9,
        max_by(h3_cell_resolution_9, segment_index)
            AS end_h3_cell_resolution_9,
        TRANSFORM(
            ARRAY_SORT(COLLECT_LIST(
                NAMED_STRUCT('segment_index', segment_index,
                    'h3_cell', h3_cell_resolution_8))),
            cell -> cell.h3_cell
        ) AS route_h3_path_resolution_8,
        CONCAT_WS('>', TRANSFORM(
            ARRAY_SORT(COLLECT_LIST(
                NAMED_STRUCT('segment_index', segment_index,
                    'h3_cell', h3_cell_resolution_9))),
            cell -> cell.h3_cell
        )) AS route_h3_signature,
        COUNT(*) AS segment_count
    FROM route_cells
    GROUP BY run_id, activity_id, activity_date, distance_km
)

SELECT *
FROM route_observations`,
    keyTechnique:
      "`collect_list` + `array_sort` + `transform` builds an ordered H3 cell array for each run. The H3 path is the foundation of route identity — compare paths, not coordinates.",
    lineageContext:
      "`route_observations` refs `runs` + `run_records`. It feeds `route_similarity_edges`, `int_route_component_roots`, and `mart_route_clusters`. Materialized as a table.",
  },
  {
    id: "route-similarity-edges",
    module: "route",
    title: "Route Similarity Graph — route_similarity_edges",
    context:
      "`route_similarity_edges` builds a bidirectional graph of similar route pairs. It " +
      "self-joins `route_observations` on three pre-filters — same `route_distance_bucket_km` " +
      "(0.5 km granularity), same start H3 cell, same end H3 cell, and within 10% distance " +
      "tolerance — before computing Jaccard similarity on their H3 paths.\n\n" +
      "Without this pruning, the self-join would be O(n²) on every run. The pre-filters " +
      "drastically reduce the candidate set. H3 cell matching uses a one-segment positional " +
      "tolerance (`abs(left_position - right_position) <= 1`). Pairs below 90% similarity are " +
      "discarded.\n\n" +
      "The output is bidirectional: each pair produces two rows, making the graph undirected " +
      "for connected-component clustering downstream. `posexplode` expands the H3 `ARRAY` " +
      "columns into individual segment positions for comparison.",
    sql: `WITH candidate_pairs AS (
    SELECT left_routes.run_id AS left_run_id,
           right_routes.run_id AS right_run_id,
           left_routes.segment_count AS left_segment_count,
           right_routes.segment_count AS right_segment_count
    FROM {{ ref('route_observations') }} AS left_routes
    INNER JOIN {{ ref('route_observations') }} AS right_routes
        ON left_routes.run_id < right_routes.run_id
            AND left_routes.route_distance_bucket_km
                = right_routes.route_distance_bucket_km
            AND left_routes.start_h3_cell_resolution_9
                = right_routes.start_h3_cell_resolution_9
            AND left_routes.end_h3_cell_resolution_9
                = right_routes.end_h3_cell_resolution_9
            AND abs(left_routes.distance_km
                    - right_routes.distance_km)
                <= LEAST(left_routes.distance_km,
                         right_routes.distance_km) * 0.10
),

route_path_segments AS (
    SELECT observations.run_id, segment_position, h3_cell
    FROM {{ ref('route_observations') }} AS observations
    lateral VIEW POSEXPLODE(
        route_h3_path_resolution_8
    ) exploded AS segment_position, h3_cell
),

pair_matches AS (
    SELECT
        candidate_pairs.left_run_id,
        candidate_pairs.right_run_id,
        COUNT(DISTINCT left_segments.segment_position)
            AS left_matched_segment_count,
        COUNT(DISTINCT right_segments.segment_position)
            AS right_matched_segment_count
    FROM candidate_pairs
    INNER JOIN route_path_segments AS left_segments
        ON candidate_pairs.left_run_id = left_segments.run_id
    INNER JOIN route_path_segments AS right_segments
        ON candidate_pairs.right_run_id = right_segments.run_id
            AND left_segments.h3_cell = right_segments.h3_cell
            AND abs(left_segments.segment_position
                    - right_segments.segment_position) <= 1
    GROUP BY candidate_pairs.left_run_id,
             candidate_pairs.right_run_id
),

similar_route_pairs AS (
    SELECT
        candidate_pairs.left_run_id,
        candidate_pairs.right_run_id,
        least(
            coalesce(pair_matches.left_matched_segment_count, 0) * 1.0
                / candidate_pairs.left_segment_count,
            coalesce(pair_matches.right_matched_segment_count, 0) * 1.0
                / candidate_pairs.right_segment_count
        ) as route_similarity
    from candidate_pairs
    left join pair_matches
        on candidate_pairs.left_run_id = pair_matches.left_run_id
            and candidate_pairs.right_run_id
                = pair_matches.right_run_id
    where least(
        coalesce(pair_matches.left_matched_segment_count, 0) * 1.0
            / candidate_pairs.left_segment_count,
        coalesce(pair_matches.right_matched_segment_count, 0) * 1.0
            / candidate_pairs.right_segment_count
    ) >= 0.90
)

-- Bidirectional edges
SELECT left_run_id AS run_id,
       right_run_id AS connected_run_id,
       route_similarity
FROM similar_route_pairs
UNION ALL
SELECT right_run_id AS run_id,
       left_run_id AS connected_run_id,
       route_similarity
FROM similar_route_pairs`,
    keyTechnique:
      "Self-join pruned by distance bucket + start/end H3 cell reduces the candidate space from O(n²) to manageable. `posexplode` expands H3 arrays for positional comparison with 1-segment tolerance.",
    lineageContext:
      "`route_similarity_edges` refs `route_observations`. It feeds `int_route_component_roots`. Materialized as a table. This was the dominant bottleneck before the pruning strategy was added.",
  },
  {
    id: "route-clustering",
    module: "route",
    title: "Connected Components — Route Clustering Chain",
    context:
      "The route clustering chain (`int_route_component_roots` → `mart_route_clusters`) " +
      "finds connected components in the similarity graph using 12 rounds of pointer-jumping. " +
      "Each node (run) initially points to the minimum route within its connected group.\n\n" +
      "Pointer-jumping works by repeatedly following the `component_root` pointer: six rounds " +
      "in the first model find partial roots, six more rounds in the second finalize them. " +
      "After `log₂(N)` rounds, every node converges to the true root of its connected " +
      "component. The 12 rounds are split across two models because Databricks Spark SQL has " +
      "limits on CTE nesting depth.\n\n" +
      "The representative route is the earliest chronologically observed run in each cluster. " +
      "Its H3 signature and distance bucket generate a stable `route_id` via `SHA-256` hash. " +
      "`route_match_similarity` is the maximum edge weight to any member in the same component " +
      "(1.0 for the representative itself). The Jinja `for` loop generates the 6 intermediate " +
      "states per model programmatically.",
    sql: `-- int_route_component_roots.sql (rounds 0-6)

WITH observations AS (
    SELECT run_id, activity_date, activity_id,
        ROW_NUMBER() OVER (
            ORDER BY activity_date, activity_id, run_id
        ) AS route_order
    FROM {{ ref('route_observations') }}
),

state_0 AS (
    SELECT observations.route_order,
        LEAST(
            observations.route_order,
            MIN(COALESCE(e.connected_order,
                observations.route_order))
        ) AS component_root
    FROM observations
    LEFT JOIN ordered_edges e
        ON observations.route_order = e.run_order
    GROUP BY observations.route_order
),

-- Jinja loop generates state_1 through state_6:
{% for i in range(1, 7) %}
state_{{ i }} AS (
    SELECT prev.route_order,
        COALESCE(prev_root.component_root,
            prev.component_root) AS component_root
    FROM state_{{ i - 1 }} prev
    LEFT JOIN state_{{ i - 1 }} prev_root
        ON prev.component_root = prev_root.route_order
){% if not loop.last %},{% endif %}
{% endfor %}

SELECT observations.run_id,
    observations.route_order,
    state_6.component_root
FROM observations
INNER JOIN state_6
    ON observations.route_order = state_6.route_order


-- mart_route_clusters.sql (rounds 7-12 + route_id)

-- Jinja loop generates state_7 through state_12
-- (same pattern AS int_route_component_roots)

SELECT rr.run_id,
    sha2(CONCAT_WS('|',
        CAST(representative_routes.route_distance_bucket_km
            AS string),
        representative_routes.route_h3_signature
    ), 256) AS route_id,
    rr.route_representative_run_id,
    component_match_similarity.route_match_similarity,
    representative_routes.route_distance_bucket_km,
    representative_routes.start_h3_cell_resolution_9,
    representative_routes.end_h3_cell_resolution_9,
    representative_routes.route_h3_signature
FROM route_representatives rr
INNER JOIN component_match_similarity
    ON rr.run_id = component_match_similarity.run_id
INNER JOIN representative_routes
    ON rr.route_representative_run_id
       = representative_routes.run_id`,
    keyTechnique:
      "Pointer-jumping in SQL: each round coalesces the root to one extra hop away. After `log₂(N)` rounds, all nodes converge. Jinja `for`-loops generate the 12 state CTEs programmatically.",
    lineageContext:
      "`int_route_component_roots` refs `route_observations` + `route_similarity_edges`. `mart_route_clusters` refs `int_route_component_roots` + `route_observations` + `route_similarity_edges`. `route_id` is a `SHA-256` hash of the representative's signature.",
  },
  {
    id: "mart-run-sessions",
    module: "route",
    title: "Session Enrichment — mart_run_sessions",
    context:
      "`mart_run_sessions` is the preferred run-level analytical mart. It takes the canonical " +
      "`runs` model and enriches it with route identity, canonical 250m segment summaries, " +
      "and prior training context from `mart_days`.\n\n" +
      "The prior training context answers 'what was the athlete\u2019s recent load before this " +
      "run?' by summing `run_count` and `distance_km` for the 7 and 28 days preceding the " +
      "activity date. The segment summary aggregates 250m canonical segments: segment count, " +
      "average pace, average grade, altitude range, and net elevation change.\n\n" +
      "Four `LEFT JOIN`s preserve runs without GPS data (no route identity), runs without " +
      "valid segments, and runs with no prior training days. The `run_id` remains the " +
      "authoritative grain.",
    sql: `WITH runs AS (
    SELECT * FROM {{ ref('runs') }}
),

segments AS (
    SELECT * FROM {{ ref('mart_run_segments') }}
    WHERE unit_system = 'metric'
        AND segment_length_m = 250.000
),

route_clusters AS (
    SELECT * FROM {{ ref('mart_route_clusters') }}
),

prior_training_context AS (
    SELECT runs.run_id,
        SUM(CASE WHEN days.calendar_date
            >= DATE_ADD(runs.activity_date, -7)
            THEN days.run_count ELSE 0
        END) AS prior_7d_run_count,
        SUM(CASE WHEN days.calendar_date
            >= DATE_ADD(runs.activity_date, -7)
            THEN days.distance_km ELSE 0.0
        END) AS prior_7d_distance_km,
        SUM(days.run_count) AS prior_28d_run_count,
        SUM(days.distance_km) AS prior_28d_distance_km
    FROM runs
    LEFT JOIN {{ ref('mart_days') }} AS days
        ON days.calendar_date
            BETWEEN DATE_ADD(runs.activity_date, -28)
                AND DATE_ADD(runs.activity_date, -1)
    GROUP BY runs.run_id
),

segment_summary AS (
    SELECT run_id,
        COUNT(*) AS segment_count,
        AVG(segment_pace_min_per_km) AS avg_segment_pace_min_per_km,
        AVG(segment_grade) AS avg_segment_grade,
        MAX(max_altitude_m) - MIN(min_altitude_m)
            AS route_altitude_range_m,
        SUM(elevation_change_m) AS net_elevation_change_m
    FROM segments GROUP BY run_id
)

SELECT
    runs.run_id, runs.activity_id, runs.activity_date,
    runs.start_time, runs.session_timestamp,
    runs.distance_km, runs.duration_seconds,
    runs.avg_pace_min_per_km, runs.speed_kmh,
    runs.avg_heart_rate, runs.max_heart_rate,
    runs.avg_cadence, runs.max_cadence,
    runs.total_ascent, runs.total_descent,
    runs.garmin_recovery_hr,
    runs.start_position_lat_deg, runs.start_position_long_deg,
    runs.end_position_lat_deg, runs.end_position_long_deg,
    runs.record_count, runs.gps_record_count,
    runs.first_record_timestamp, runs.last_record_timestamp,
    runs.start_record_latitude_deg, runs.start_record_longitude_deg,
    runs.end_record_latitude_deg, runs.end_record_longitude_deg,
    runs.record_distance_km,
    runs.record_distance_coverage_ratio,
    route_clusters.route_id,
    route_clusters.route_representative_run_id,
    route_clusters.route_match_similarity,
    route_clusters.route_distance_bucket_km,
    route_clusters.start_h3_cell_resolution_9,
    route_clusters.end_h3_cell_resolution_9,
    route_clusters.route_h3_signature,
    segment_summary.segment_count,
    segment_summary.avg_segment_pace_min_per_km,
    segment_summary.avg_segment_grade,
    segment_summary.route_altitude_range_m,
    segment_summary.net_elevation_change_m,
    prior_training_context.prior_7d_run_count,
    prior_training_context.prior_7d_distance_km,
    prior_training_context.prior_28d_run_count,
    prior_training_context.prior_28d_distance_km
FROM runs
LEFT JOIN route_clusters ON runs.run_id = route_clusters.run_id
LEFT JOIN segment_summary ON runs.run_id = segment_summary.run_id
LEFT JOIN prior_training_context
    ON runs.run_id = prior_training_context.run_id`,
    keyTechnique:
      "Four independent `LEFT JOIN`s enrich each run: route identity, segment summary, and prior training context all join on `run_id`. None are mandatory — runs without GPS still get full session metrics.",
    lineageContext:
      "`mart_run_sessions` refs `runs` + `mart_days` + `mart_run_segments` + `mart_route_clusters`. It feeds `mart_routes`. Exported to Supabase as `site_runs_core`.",
  },
  {
    id: "mart-routes",
    module: "route",
    title: "Route Profiles — mart_routes",
    context:
      "`mart_routes` aggregates historical outcomes for each detected `route_id`. It groups " +
      "`mart_run_sessions` by `route_id` to compute lifetime statistics: run count, average " +
      "distance, average pace, average heart rate, average ascent/descent, and route dimensions.\n\n" +
      "The representative route centroid is computed from the 500-point map profile records " +
      "of the earliest run in the cluster. This provides a stable geographic center for " +
      "placing route markers on the overview map without recomputing centroids from full " +
      "telemetry.\n\n" +
      "The start point (first GPS record of the representative run) is used to resolve a " +
      "human-readable city name via the geonames database. A `LEFT JOIN` with `route_city_names` " +
      "adds city name, country name, and country code, enabling map-based city grouping " +
      "without runtime reverse geocoding.",
    sql: `WITH sessions AS (
    SELECT * FROM {{ ref('mart_run_sessions') }}
    WHERE route_id IS NOT NULL
),

route_summaries AS (
    SELECT route_id,
        MIN(route_representative_run_id)
            AS route_representative_run_id,
        MIN(activity_date) AS first_observed_activity_date,
        MAX(activity_date) AS latest_observed_activity_date,
        COUNT(*) AS run_count,
        MIN(route_match_similarity) AS min_route_match_similarity,
        AVG(route_match_similarity) AS avg_route_match_similarity,
        AVG(distance_km) AS avg_distance_km,
        MIN(distance_km) AS min_distance_km,
        MAX(distance_km) AS max_distance_km,
        AVG(duration_seconds) AS avg_duration_seconds,
        AVG(avg_pace_min_per_km) AS avg_pace_min_per_km,
        AVG(avg_heart_rate) AS avg_heart_rate,
        AVG(total_ascent) AS avg_total_ascent,
        AVG(total_descent) AS avg_total_descent,
        AVG(segment_count) AS avg_segment_count,
        AVG(avg_segment_grade) AS avg_segment_grade,
        AVG(route_altitude_range_m) AS avg_route_altitude_range_m,
        MIN(route_distance_bucket_km) AS route_distance_bucket_km,
        MIN(start_h3_cell_resolution_9) AS start_h3_cell_resolution_9,
        MIN(end_h3_cell_resolution_9) AS end_h3_cell_resolution_9,
        MIN(route_h3_signature) AS route_h3_signature
    FROM sessions GROUP BY route_id
),

representative_route_centroids AS (
    SELECT
        routes.route_id,
        AVG(records.position_lat_deg)
            AS representative_route_centroid_latitude_deg,
        AVG(records.position_long_deg)
            AS representative_route_centroid_longitude_deg
    FROM route_summaries AS routes
    INNER JOIN {{ ref('mart_map_profile_records') }} AS records
        ON records.run_id = routes.route_representative_run_id
    WHERE records.position_lat_deg BETWEEN -90 AND 90
      AND records.position_long_deg BETWEEN -180 AND 180
    GROUP BY routes.route_id
),

run_start_records AS (
    SELECT
        run_id,
        MIN(record_index) AS start_record_index
    FROM {{ ref('mart_map_profile_records') }}
    GROUP BY run_id
),

representative_route_start_points AS (
    SELECT
        routes.route_id,
        records.position_lat_deg AS route_start_latitude_deg,
        records.position_long_deg AS route_start_longitude_deg
    FROM route_summaries AS routes
    INNER JOIN run_start_records AS starts
        ON starts.run_id = routes.route_representative_run_id
    INNER JOIN {{ ref('mart_map_profile_records') }} AS records
        ON records.run_id = starts.run_id
        AND records.record_index = starts.start_record_index
    WHERE records.position_lat_deg BETWEEN -90 AND 90
      AND records.position_long_deg BETWEEN -180 AND 180
)

SELECT
    routes.*,
    centroids.representative_route_centroid_latitude_deg,
    centroids.representative_route_centroid_longitude_deg,
    starts.route_start_latitude_deg,
    starts.route_start_longitude_deg,
    cities.city_name,
    cities.country_name,
    cities.country_code
FROM route_summaries AS routes
LEFT JOIN representative_route_centroids AS centroids
    ON routes.route_id = centroids.route_id
LEFT JOIN representative_route_start_points AS starts
    ON routes.route_id = starts.route_id
LEFT JOIN route_city_names AS cities
    ON routes.route_id = cities.route_id`,
    keyTechnique:
      "Aggregation over `route_id` with `MIN` for first/latest dates and `AVG` for all performance metrics. Start points are extracted from the first GPS record of the representative run, then `LEFT JOIN route_city_names` resolves each route to its nearest city via the geonames database.",
    lineageContext:
      "`mart_routes` refs `mart_run_sessions` + `mart_map_profile_records` + `route_city_names`. It feeds `mart_route_prediction_features`. Exported to Supabase as `site_routes`.",
  },

  // ── MODULE 7: Signals ──
  {
    id: "mart-running-signals",
    module: "signals",
    title: "Combined Run Signals — mart_running_signals",
    context:
      "`mart_running_signals` joins `mart_fitness` (run-level fitness indicators) with " +
      "`mart_weeks` (week-level training context) on `date_trunc('week', activity_date)`. " +
      "This cross-grain enrichment provides a single-table view for analysis that needs " +
      "both run metrics and weekly context.\n\n" +
      "The model is intentionally thin — all business logic lives upstream in `mart_fitness` " +
      "and `mart_weeks`. `mart_running_signals` is purely a join, making every value " +
      "auditable by tracing back to its source model without intermediate transformation.",
    sql: `WITH fitness AS (
    SELECT * FROM {{ ref('mart_fitness') }}
),
weeks AS (
    SELECT * FROM {{ ref('mart_weeks') }}
)

SELECT
    fitness.*,
    weeks.week_start_date,
    weeks.runs_per_week,
    weeks.active_week_flag,
    weeks.missed_week_flag,
    weeks.rolling_4w_run_count,
    weeks.active_week_streak,
    weeks.missed_weeks_12w,
    weeks.weekly_distance_km,
    weeks.rolling_4w_distance_km,
    weeks.rolling_12w_distance_km,
    weeks.long_run_distance_km,
    weeks.long_run_share_of_week
FROM fitness
LEFT JOIN weeks
    ON DATE_TRUNC('week', fitness.activity_date)
        = weeks.week_start_date`,
    keyTechnique:
      "Cross-grain `LEFT JOIN`: run-level (`mart_fitness`) ← week-level (`mart_weeks`) via `date_trunc`. A thin join model — all business logic is upstream, making it auditable.",
    lineageContext:
      "`mart_running_signals` refs `mart_fitness` + `mart_weeks`. Not exported to Supabase. Serves as a convenience model for Databricks analysis combining run and week contexts.",
  },
  {
    id: "mart-weekly-training-features",
    module: "signals",
    title: "Prediction Features — mart_weekly_training_features",
    context:
      "`mart_weekly_training_features` extends `mart_weeks` with `lag()` and `lead()` " +
      "windows to create prediction-ready feature and label columns. For each week, prior " +
      "week values (lag) and next week values (lead) are provided for run count, distance, " +
      "duration, and active-week status.\n\n" +
      "This is designed for offline ML experimentation: the lag columns serve as features " +
      "(model input), while the lead columns serve as labels (prediction target). The " +
      "temporal ordering prevents data leakage — features always precede labels.\n\n" +
      "Boundaries at the first and last weeks produce null lag/lead values, which is " +
      "expected for edge observations. This model provides a transparent feature table; " +
      "it does not train models or generate predictions.",
    sql: `WITH weeks AS (
    SELECT * FROM {{ ref('mart_weeks') }}
)

SELECT *,
    LAG(runs_per_week) OVER (
        ORDER BY week_start_date
    ) AS prior_week_runs_per_week,
    LAG(weekly_distance_km) OVER (
        ORDER BY week_start_date
    ) AS prior_week_distance_km,
    LAG(weekly_duration_seconds) OVER (
        ORDER BY week_start_date
    ) AS prior_week_duration_seconds,
    LAG(active_week_flag) OVER (
        ORDER BY week_start_date
    ) AS prior_week_active_week_flag,
    LEAD(runs_per_week) OVER (
        ORDER BY week_start_date
    ) AS next_week_runs_per_week,
    LEAD(weekly_distance_km) OVER (
        ORDER BY week_start_date
    ) AS next_week_distance_km,
    LEAD(weekly_duration_seconds) OVER (
        ORDER BY week_start_date
    ) AS next_week_duration_seconds,
    LEAD(active_week_flag) OVER (
        ORDER BY week_start_date
    ) AS next_week_active_week_flag
FROM weeks`,
    keyTechnique:
      "`lag()` for features, `lead()` for labels — both over `ORDER BY week_start_date`. The same window ordering prevents data leakage: features always precede labels temporally.",
    lineageContext:
      "`mart_weekly_training_features` refs `mart_weeks`. Not exported. Serves as a prediction-ready feature table for offline ML experimentation.",
  },
  {
    id: "mart-route-prediction-features",
    module: "signals",
    title: "Route Prediction Labels — mart_route_prediction_features",
    context:
      "`mart_route_prediction_features` provides feature and label columns for route-level " +
      "predictive modeling. It combines `mart_run_sessions` (per-run features and labels) " +
      "with `mart_routes` (lifetime route characteristics).\n\n" +
      "Prior route context uses `ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING` " +
      "partitioned by `route_id` — the window looks at all previous runs on the same route, " +
      "excluding the current run. This produces features like 'how many times have I run " +
      "this route before?' and 'what was my average pace on prior attempts?'\n\n" +
      "Label columns are prefixed with `label_` (`label_avg_pace_min_per_km`, " +
      "`label_avg_heart_rate`) to clearly separate prediction targets from input features. " +
      "This model provides a transparent feature table; it does not train models or generate " +
      "predictions.",
    sql: `WITH sessions AS (
    SELECT * FROM {{ ref('mart_run_sessions') }}
    WHERE route_id IS NOT NULL
),
routes AS (
    SELECT * FROM {{ ref('mart_routes') }}
),

    session_features AS (
        SELECT sessions.*,
            COUNT(*) OVER (
                PARTITION BY sessions.route_id
                ORDER BY sessions.activity_date, sessions.activity_id
                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ) AS prior_route_run_count,
            AVG(sessions.avg_pace_min_per_km) OVER (
                PARTITION BY sessions.route_id
                ORDER BY sessions.activity_date, sessions.activity_id
                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ) AS prior_route_avg_pace_min_per_km,
            AVG(sessions.avg_heart_rate) OVER (
                PARTITION BY sessions.route_id
                ORDER BY sessions.activity_date, sessions.activity_id
                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ) AS prior_route_avg_heart_rate,
            AVG(sessions.duration_seconds) OVER (
                PARTITION BY sessions.route_id
                ORDER BY sessions.activity_date, sessions.activity_id
                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ) AS prior_route_avg_duration_seconds
        FROM sessions
    )

    SELECT
        session_features.run_id,
        session_features.activity_id,
        session_features.activity_date,
        session_features.route_id,
        session_features.route_distance_bucket_km,
        session_features.segment_count,
        session_features.avg_segment_grade,
        session_features.route_altitude_range_m,
        session_features.total_ascent,
        session_features.total_descent,
        session_features.prior_7d_run_count,
        session_features.prior_7d_distance_km,
        session_features.prior_28d_run_count,
        session_features.prior_28d_distance_km,
        session_features.prior_route_run_count,
        session_features.prior_route_avg_pace_min_per_km,
        session_features.prior_route_avg_heart_rate,
        session_features.prior_route_avg_duration_seconds,
        routes.run_count AS route_lifetime_run_count,
        routes.avg_distance_km AS route_lifetime_avg_distance_km,
        routes.avg_pace_min_per_km AS route_lifetime_avg_pace_min_per_km,
        routes.avg_heart_rate AS route_lifetime_avg_heart_rate,
        session_features.distance_km AS label_completion_distance_km,
        session_features.duration_seconds AS label_duration_seconds,
        session_features.avg_pace_min_per_km AS label_avg_pace_min_per_km,
        session_features.avg_heart_rate AS label_avg_heart_rate
FROM session_features
LEFT JOIN routes
    ON session_features.route_id = routes.route_id`,
    keyTechnique:
      "`PARTITION BY route_id` with `ROWS UNBOUNDED PRECEDING AND 1 PRECEDING` computes cumulative prior context per route. `label_` prefix convention separates prediction targets from features.",
    lineageContext:
      "`mart_route_prediction_features` refs `mart_run_sessions` + `mart_routes`. Not exported. Intended for offline ML experimentation with route-level prediction models.",
  },
];

export const totalSteps = curriculum.length;
