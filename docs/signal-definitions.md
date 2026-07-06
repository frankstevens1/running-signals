# Signal Definitions

Running Signals is descriptive training analytics. It does not provide coaching prescriptions,
readiness scores, medical metrics, or health diagnoses.

The primary analytical grain is the completed calendar day. Weekly, monthly, and yearly metrics are
rollups from `mart_days`.

## Consistency Signals

Consistency describes how regularly running occurs.

| Metric | Grain | Formula / Definition | Source Model | Status |
|---|---|---|---|---|
| `run_count` | Day | Count of running activities on `calendar_date`. | `mart_days` | Implemented |
| `active_day_flag` | Day | `true` when `run_count > 0`. | `mart_days` | Implemented |
| `missed_day_flag` | Day | `true` when `run_count = 0`. | `mart_days` | Implemented |
| `rolling_7d_run_count` | Day | Sum of `run_count` over current day and previous six days. | `mart_days` | Implemented |
| `rolling_28d_run_count` | Day | Sum of `run_count` over current day and previous 27 days. | `mart_days` | Implemented |
| `runs_per_week` | Week | Sum of daily `run_count` in a completed calendar week. | `mart_weeks` | Compatibility |
| `active_week_flag` | Week | `true` when `runs_per_week > 0`. | `mart_weeks` | Compatibility |
| `missed_week_flag` | Week | `true` when `runs_per_week = 0`. | `mart_weeks` | Compatibility |
| `rolling_4w_run_count` | Week | Sum of `runs_per_week` over current completed week and previous three. | `mart_weeks` | Compatibility |
| `active_week_streak` | Week | Consecutive active completed weeks ending in the current week. | `mart_weeks` | Compatibility |
| `missed_weeks_12w` | Week | Missed completed weeks over the current week and previous eleven. | `mart_weeks` | Compatibility |

## Volume Signals

Volume describes accumulated running load from distance and duration.

| Metric | Grain | Formula / Definition | Source Model | Status |
|---|---|---|---|---|
| `distance_km` | Day | Sum of session `distance_km` on `calendar_date`. | `mart_days` | Implemented |
| `duration_seconds` | Day | Sum of session duration on `calendar_date`. | `mart_days` | Implemented |
| `long_run_distance_km` | Day | Maximum single-run distance on `calendar_date`. | `mart_days` | Implemented |
| `rolling_7d_distance_km` | Day | Sum of daily distance over current day and previous six days. | `mart_days` | Implemented |
| `rolling_28d_distance_km` | Day | Sum of daily distance over current day and previous 27 days. | `mart_days` | Implemented |
| `weekly_distance_km` | Week | Sum of daily distance in a completed calendar week. | `mart_weeks` | Compatibility |
| `rolling_4w_distance_km` | Week | Sum of weekly distance over current completed week and previous three. | `mart_weeks` | Compatibility |
| `rolling_12w_distance_km` | Week | Sum of weekly distance over current completed week and previous eleven. | `mart_weeks` | Compatibility |
| `monthly_distance_km` | Month | Sum of daily distance in the observed calendar month. | `mart_months` | Implemented |
| `yearly_distance_km` | Year | Sum of daily distance in the observed calendar year. | `mart_years` | Implemented |

## Fitness Signals

Fitness describes directional aerobic performance using run-level pace, speed, heart rate, Recovery
HR when Garmin provides it, and descriptive daily health context.

| Metric | Grain | Formula / Definition | Source Model | Status |
|---|---|---|---|---|
| `avg_pace_min_per_km` | Run | `duration_seconds / 60 / distance_km` when distance is greater than zero. | `silver_runs`, `signal_fitness` | Implemented |
| `speed_kmh` | Run | Enhanced average speed converted to km/h, or distance divided by duration. | `silver_runs` | Implemented |
| `avg_heart_rate` | Run | Average heart rate from the Garmin FIT session message. | `silver_runs` | Implemented when present |
| `efficiency_ratio` | Run | `speed_kmh / avg_heart_rate` when heart rate is present and positive. | `signal_fitness` | Implemented |
| `hr_band` | Run | Bucketed average heart-rate band. | `signal_fitness` | Implemented |
| `rolling_4_run_efficiency_ratio` | Run | Average efficiency over the current and previous three runs. | `signal_fitness` | Implemented |
| `hr_drift_pct` | Run | Second-half segment efficiency divided by first-half segment efficiency minus one, where segment efficiency is `avg_speed_kmh / avg_heart_rate`. | `signal_fitness`, `mart_run_segments` | Implemented when segment HR and speed are present |
| `rolling_4_run_hr_drift_pct` | Run | Average HR drift over the current and previous three runs. | `signal_fitness` | Implemented |
| `garmin_recovery_hr` | Run | Garmin post-activity heart-rate drop when parsed from FIT events. | `silver_runs` | Nullable |
| `resting_heart_rate` | Day | Garmin daily resting heart rate. | `silver_health_days`, `mart_days` | Implemented when present |
| `hrv_value` | Day | Garmin daily HRV value when present. | `silver_health_days`, `mart_days` | Implemented when present |
| `sleep_score` | Day | Garmin sleep score when present. | `silver_health_days`, `mart_days` | Implemented when present |

Daily resting heart rate, HRV, and sleep score are context fields only.

## Route And Segment Signals

Route and within-run analytics are portfolio-oriented feature marts, not a production ML pipeline.

| Metric | Grain | Formula / Definition | Source Model | Status |
|---|---|---|---|---|
| `segment_index` | Run segment | Fixed 250m segment number within a run. | `mart_run_segments` | Implemented |
| `segment_pace_min_per_km` | Run segment | Segment duration divided by segment distance. | `mart_run_segments` | Implemented |
| `avg_heart_rate` | Run segment | Average record heart rate within the segment. | `mart_run_segments` | Implemented when present |
| `elevation_change_m` | Run segment | End altitude minus start altitude within the segment. | `mart_run_segments` | Implemented when present |
| `segment_grade` | Run segment | Elevation change divided by segment distance in meters. | `mart_run_segments` | Implemented when present |
| `route_id` | Route | Hash of ordered representative H3 cells plus approximate distance bucket. | `mart_run_sessions`, `mart_routes` | Implemented when GPS exists |
| `prior_7d_distance_km` | Run session | Distance in the seven completed days before the run. | `mart_run_sessions` | Implemented |
| `prior_route_avg_pace_min_per_km` | Run-route observation | Historical average pace on the same route before the current run. | `mart_route_prediction_features` | Implemented |
| `label_avg_pace_min_per_km` | Run-route observation | Current run pace label for later prediction experiments. | `mart_route_prediction_features` | Implemented |

## Known Limitations

- Session-level heart rate is coarse and does not capture within-run effort distribution.
- Route identity uses H3 path signatures and approximate distance buckets. It is stable enough for
  portfolio analytics, but not a replacement for precise map matching.
- Heart-rate and pace comparisons remain directional because weather, terrain, fatigue, and device
  behavior vary.
- Daily health endpoint availability varies by Garmin account, device, and date. Missing values
  remain null with explicit availability flags.
