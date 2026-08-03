import type {
  DayRollup,
  FitnessPoint,
  MapProfileRecord,
  MonthRollup,
  RunFilterBounds,
  RunSegment,
  RouteSummary,
  RunSession,
  WeekRollup,
  YearRollup,
} from "./types";

export function stringValue(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  return String(value);
}

export function numberValue(row: Record<string, unknown>, key: string): number | null {
  const value = row[key];
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function booleanValue(row: Record<string, unknown>, key: string): boolean {
  const value = row[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}

export function mapRun(row: Record<string, unknown>): RunSession {
  return {
    runId: stringValue(row, "run_id") ?? "",
    activityId: stringValue(row, "activity_id") ?? "",
    activityDate: stringValue(row, "activity_date") ?? "",
    startTime: stringValue(row, "start_time"),
    distanceKm: numberValue(row, "distance_km"),
    durationSeconds: numberValue(row, "duration_seconds"),
    avgPaceMinPerKm: numberValue(row, "avg_pace_min_per_km"),
    speedKmh: numberValue(row, "speed_kmh"),
    avgHeartRate: numberValue(row, "avg_heart_rate"),
    maxHeartRate: numberValue(row, "max_heart_rate"),
    totalAscent: numberValue(row, "total_ascent"),
    totalDescent: numberValue(row, "total_descent"),
    garminRecoveryHr: numberValue(row, "garmin_recovery_hr"),
    routeId: stringValue(row, "route_id"),
    routeDistanceBucketKm: numberValue(row, "route_distance_bucket_km"),
    recordDistanceCoverageRatio: numberValue(row, "record_distance_coverage_ratio"),
    segmentCount: numberValue(row, "segment_count"),
    avgSegmentGrade: numberValue(row, "avg_segment_grade"),
    routeAltitudeRangeM: numberValue(row, "route_altitude_range_m"),
    prior7dDistanceKm: numberValue(row, "prior_7d_distance_km"),
    prior28dDistanceKm: numberValue(row, "prior_28d_distance_km"),
    distanceEconomyMperBeat: numberValue(row, "distance_economy_m_per_beat"),
    elevationEconomyMperBeat: numberValue(row, "elevation_economy_m_per_beat"),
    personalEfficiencyScore: numberValue(row, "personal_efficiency_score"),
    avgCadence: numberValue(row, "avg_cadence"),
    maxCadence: numberValue(row, "max_cadence"),
  };
}

export function mapRunFilterBounds(row: Record<string, unknown>): RunFilterBounds {
  return {
    minActivityDate: stringValue(row, "min_activity_date"),
    maxActivityDate: stringValue(row, "max_activity_date"),
    minDistanceKm: numberValue(row, "min_distance_km"),
    maxDistanceKm: numberValue(row, "max_distance_km"),
    minPaceMinPerKm: numberValue(row, "min_pace_min_per_km"),
    maxPaceMinPerKm: numberValue(row, "max_pace_min_per_km"),
    minAvgHeartRate: numberValue(row, "min_avg_heart_rate"),
    maxAvgHeartRate: numberValue(row, "max_avg_heart_rate"),
    minGpsCoverage: numberValue(row, "min_gps_coverage"),
    maxGpsCoverage: numberValue(row, "max_gps_coverage"),
    minAltitudeRangeM: numberValue(row, "min_route_altitude_range_m"),
    maxAltitudeRangeM: numberValue(row, "max_route_altitude_range_m"),
  };
}

export function mapRoute(row: Record<string, unknown>): RouteSummary {
  return {
    routeId: stringValue(row, "route_id") ?? "",
    latestObservedActivityDate: stringValue(row, "latest_observed_activity_date"),
    runCount: numberValue(row, "run_count") ?? 0,
    avgDistanceKm: numberValue(row, "avg_distance_km"),
    avgPaceMinPerKm: numberValue(row, "avg_pace_min_per_km"),
    avgHeartRate: numberValue(row, "avg_heart_rate"),
    representativeRouteCentroidLatitudeDeg: numberValue(
      row,
      "representative_route_centroid_latitude_deg",
    ),
    representativeRouteCentroidLongitudeDeg: numberValue(
      row,
      "representative_route_centroid_longitude_deg",
    ),
    cityName: stringValue(row, "city_name"),
    countryName: stringValue(row, "country_name"),
    countryCode: stringValue(row, "country_code"),
  };
}

export function mapMapProfileRecord(
  row: Record<string, unknown>,
): MapProfileRecord {
  return {
    recordIndex: numberValue(row, "record_index") ?? 0,
    distanceKm: numberValue(row, "record_distance_km"),
    altitudeM: numberValue(row, "altitude_m"),
    paceMinPerKm: numberValue(row, "pace_min_per_km"),
    heartRate: numberValue(row, "heart_rate"),
    latitudeDeg: numberValue(row, "position_lat_deg"),
    longitudeDeg: numberValue(row, "position_long_deg"),
  };
}

export function mapSegment(row: Record<string, unknown>): RunSegment {
  return {
    runId: stringValue(row, "run_id") ?? "",
    unitSystem: stringValue(row, "unit_system") === "imperial" ? "imperial" : "metric",
    segmentLengthValue: numberValue(row, "segment_length_value") ?? 0,
    segmentIndex: numberValue(row, "segment_index") ?? 0,
    segmentDistanceKm: numberValue(row, "segment_distance_km"),
    segmentDurationSeconds: numberValue(row, "segment_duration_seconds"),
    segmentPaceMinPerKm: numberValue(row, "segment_pace_min_per_km"),
    avgHeartRate: numberValue(row, "avg_heart_rate"),
    maxHeartRate: numberValue(row, "max_heart_rate"),
    avgRunningCadence: numberValue(row, "avg_running_cadence"),
    elevationChangeM: numberValue(row, "elevation_change_m"),
    segmentGrade: numberValue(row, "segment_grade"),
    segmentStartDistanceKm: numberValue(row, "segment_start_distance_km"),
    segmentEndDistanceKm: numberValue(row, "segment_end_distance_km"),
  };
}

export function mapDay(row: Record<string, unknown>): DayRollup {
  return {
    calendarDate: stringValue(row, "calendar_date") ?? "",
    runCount: numberValue(row, "run_count") ?? 0,
    distanceKm: numberValue(row, "distance_km") ?? 0,
    durationSeconds: numberValue(row, "duration_seconds") ?? 0,
    longRunDistanceKm: numberValue(row, "long_run_distance_km") ?? 0,
    activeDayFlag: booleanValue(row, "active_day_flag"),
    rolling7dDistanceKm: numberValue(row, "rolling_7d_distance_km"),
    rolling28dDistanceKm: numberValue(row, "rolling_28d_distance_km"),
  };
}

export function mapWeek(row: Record<string, unknown>): WeekRollup {
  return {
    weekStartDate: stringValue(row, "week_start_date") ?? "",
    weekEndDate: stringValue(row, "week_end_date") ?? "",
    runsPerWeek: numberValue(row, "runs_per_week") ?? 0,
    weeklyDistanceKm: numberValue(row, "weekly_distance_km") ?? 0,
    avgRunDistanceKm: numberValue(row, "avg_run_distance_km"),
    weeklyDurationSeconds: numberValue(row, "weekly_duration_seconds") ?? 0,
    avgPaceMinPerKm: numberValue(row, "avg_pace_min_per_km"),
    longRunDistanceKm: numberValue(row, "long_run_distance_km"),
    longRunShareOfWeek: numberValue(row, "long_run_share_of_week"),
    activeDays: numberValue(row, "active_days") ?? 0,
    missedDays: numberValue(row, "missed_days") ?? 0,
    activeWeekFlag: booleanValue(row, "active_week_flag"),
    rolling4wDistanceKm: numberValue(row, "rolling_4w_distance_km"),
    rolling12wDistanceKm: numberValue(row, "rolling_12w_distance_km"),
    activeWeekStreak: numberValue(row, "active_week_streak"),
    missedWeeks12w: numberValue(row, "missed_weeks_12w"),
  };
}

export function mapMonth(row: Record<string, unknown>): MonthRollup {
  return {
    monthStartDate: stringValue(row, "month_start_date") ?? "",
    calendarYear: numberValue(row, "calendar_year") ?? 0,
    calendarMonth: numberValue(row, "calendar_month") ?? 0,
    runsPerMonth: numberValue(row, "runs_per_month") ?? 0,
    monthlyDistanceKm: numberValue(row, "monthly_distance_km") ?? 0,
    monthlyDurationSeconds: numberValue(row, "monthly_duration_seconds") ?? 0,
    longRunDistanceKm: numberValue(row, "long_run_distance_km"),
    activeDays: numberValue(row, "active_days") ?? 0,
  };
}

export function mapYear(row: Record<string, unknown>): YearRollup {
  return {
    yearStartDate: stringValue(row, "year_start_date") ?? "",
    calendarYear: numberValue(row, "calendar_year") ?? 0,
    runsPerYear: numberValue(row, "runs_per_year") ?? 0,
    yearlyDistanceKm: numberValue(row, "yearly_distance_km") ?? 0,
    yearlyDurationSeconds: numberValue(row, "yearly_duration_seconds") ?? 0,
    longRunDistanceKm: numberValue(row, "long_run_distance_km"),
    activeDays: numberValue(row, "active_days") ?? 0,
  };
}

export function mapFitness(row: Record<string, unknown>): FitnessPoint {
  const aerobicDecouplingStatus = stringValue(row, "aerobic_decoupling_status");

  return {
    activityId: stringValue(row, "activity_id") ?? "",
    activityDate: stringValue(row, "activity_date") ?? "",
    distanceKm: numberValue(row, "distance_km"),
    avgPaceMinPerKm: numberValue(row, "avg_pace_min_per_km"),
    speedKmh: numberValue(row, "speed_kmh"),
    avgHeartRate: numberValue(row, "avg_heart_rate"),
    endingHeartRate: numberValue(row, "ending_heart_rate"),
    efficiencyRatio: numberValue(row, "efficiency_ratio"),
    rolling4RunEfficiencyRatio: numberValue(row, "rolling_4_run_efficiency_ratio"),
    aerobicDecouplingPct: numberValue(row, "aerobic_decoupling_pct"),
    aerobicDecouplingStatus:
      aerobicDecouplingStatus === "eligible" || aerobicDecouplingStatus === "ineligible"
        ? aerobicDecouplingStatus
        : null,
    aerobicDecouplingUnavailableReason: stringValue(row, "aerobic_decoupling_unavailable_reason"),
    aerobicDecouplingMovingDurationSeconds: numberValue(row, "aerobic_decoupling_moving_duration_seconds"),
    aerobicDecouplingValidSegmentCount: numberValue(row, "aerobic_decoupling_valid_segment_count"),
    aerobicDecouplingHrCoverageRatio: numberValue(row, "aerobic_decoupling_hr_coverage_ratio"),
    aerobicDecouplingMaximumHrGapSeconds: numberValue(row, "aerobic_decoupling_maximum_hr_gap_seconds"),
    firstHalfSpeedKmh: numberValue(row, "first_half_speed_kmh"),
    secondHalfSpeedKmh: numberValue(row, "second_half_speed_kmh"),
    firstHalfAvgHeartRate: numberValue(row, "first_half_avg_heart_rate"),
    secondHalfAvgHeartRate: numberValue(row, "second_half_avg_heart_rate"),
    firstHalfEfficiencyRatio: numberValue(row, "first_half_efficiency_ratio"),
    secondHalfEfficiencyRatio: numberValue(row, "second_half_efficiency_ratio"),
    aerobicDecouplingPrior90dCount: numberValue(row, "aerobic_decoupling_prior_90d_count"),
    aerobicDecouplingPrior90dMedian: numberValue(row, "aerobic_decoupling_prior_90d_median"),
    aerobicDecouplingPrior90dQ1: numberValue(row, "aerobic_decoupling_prior_90d_q1"),
    aerobicDecouplingPrior90dQ3: numberValue(row, "aerobic_decoupling_prior_90d_q3"),
    rolling4RunRecoveryHr: numberValue(row, "rolling_4_run_recovery_hr"),
    recoveryPrior90dCount: numberValue(row, "recovery_prior_90d_count"),
    recoveryPrior90dMedian: numberValue(row, "recovery_prior_90d_median"),
    recoveryPrior90dQ1: numberValue(row, "recovery_prior_90d_q1"),
    recoveryPrior90dQ3: numberValue(row, "recovery_prior_90d_q3"),
    recoveryPrior90dMin: numberValue(row, "recovery_prior_90d_min"),
    recoveryPrior90dMax: numberValue(row, "recovery_prior_90d_max"),
    hrBand: stringValue(row, "hr_band"),
    garminRecoveryHr: numberValue(row, "garmin_recovery_hr"),
    distanceEconomyMperBeat: numberValue(row, "distance_economy_m_per_beat"),
    elevationEconomyMperBeat: numberValue(row, "elevation_economy_m_per_beat"),
    personalEfficiencyScore: numberValue(row, "personal_efficiency_score"),
  };
}
