# Signal Definitions

## Consistency Signals

| Metric | Definition |
|---|---|
| runs_per_week | Count of running activities per calendar week |
| active_week_flag | Whether at least one run occurred in the week |
| rolling_4w_run_count | Total runs over the current and previous three weeks |
| missed_week_flag | Whether no runs occurred in a calendar week |

## Volume Signals

| Metric | Definition |
|---|---|
| weekly_distance_km | Total running distance per calendar week |
| rolling_4w_distance_km | Total distance over the current and previous three weeks |
| long_run_distance_km | Longest run distance in a week |
| long_run_share_of_week | Longest run distance divided by weekly distance |

## Fitness Signals

| Metric | Definition |
|---|---|
| avg_pace_min_per_km | Average pace for a run |
| avg_heart_rate | Average heart rate for a run |
| efficiency_ratio | Speed in km/h divided by average heart rate |
| hr_band | Heart-rate comparison band, e.g. 130-140, 140-150, 150-160 bpm |
| avg_pace_by_hr_band | Average pace within comparable heart-rate bands |
| garmin_recovery_hr | Garmin's built-in two-minute recovery heart-rate drop |
| resting_hr_7d_avg | Seven-day rolling average resting heart rate |
| resting_hr_30d_avg | Thirty-day rolling average resting heart rate |

## Notes

Garmin Recovery HR is treated as a fitness signal, not a standalone recovery pillar.

A higher Garmin Recovery HR value generally indicates a larger heart-rate drop after stopping exercise, which can suggest better cardiovascular recovery. It is directional and context-dependent, not diagnostic.