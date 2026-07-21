export type DataResult<T> =
  | { status: "ok"; data: T }
  | { status: "not_configured"; message: string }
  | { status: "error"; message: string };

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

export type RunFilterBounds = {
  minActivityDate: string | null;
  maxActivityDate: string | null;
  minDistanceKm: number | null;
  maxDistanceKm: number | null;
  minPaceMinPerKm: number | null;
  maxPaceMinPerKm: number | null;
  minAvgHeartRate: number | null;
  maxAvgHeartRate: number | null;
  minGpsCoverage: number | null;
  maxGpsCoverage: number | null;
};

export type DashboardSummary = {
  latestCompletedDate: string | null;
  totalRuns: number;
  totalDistanceKm: number;
  recent7dDistanceKm: number;
  recent28dDistanceKm: number;
  activeWeeks: number;
  activeMonths: number;
  healthCoverage: {
    hrvDays: number;
    rhrDays: number;
    sleepDays: number;
    heartRateDays: number;
  };
  latestRun: RunSession | null;
};

export type LandingStatus = {
  latestCompletedDate: string | null;
  statusLabel: string;
  goldSchema: string | null;
};

export type RunSession = {
  runId: string;
  activityId: string;
  activityDate: string;
  startTime: string | null;
  distanceKm: number | null;
  durationSeconds: number | null;
  avgPaceMinPerKm: number | null;
  speedKmh: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  totalAscent: number | null;
  totalDescent: number | null;
  garminRecoveryHr: number | null;
  routeId: string | null;
  routeDistanceBucketKm: number | null;
  recordDistanceCoverageRatio: number | null;
  segmentCount: number | null;
  avgSegmentGrade: number | null;
  routeAltitudeRangeM: number | null;
  restingHeartRate: number | null;
  hrvValue: number | null;
  hrvStatus: string | null;
  sleepScore: number | null;
  sleepDurationSeconds: number | null;
  prior7dDistanceKm: number | null;
  prior28dDistanceKm: number | null;
};

export type RouteSummary = {
  routeId: string;
  firstObservedActivityDate: string | null;
  latestObservedActivityDate: string | null;
  runCount: number;
  avgDistanceKm: number | null;
  minDistanceKm: number | null;
  maxDistanceKm: number | null;
  avgDurationSeconds: number | null;
  avgPaceMinPerKm: number | null;
  avgHeartRate: number | null;
  avgTotalAscent: number | null;
  avgTotalDescent: number | null;
  avgSegmentGrade: number | null;
  avgRouteAltitudeRangeM: number | null;
  routeDistanceBucketKm: number | null;
  representativeRouteCentroidLatitudeDeg: number | null;
  representativeRouteCentroidLongitudeDeg: number | null;
};

export type MapProfileRecord = {
  recordIndex: number;
  distanceKm: number | null;
  altitudeM: number | null;
  latitudeDeg: number | null;
  longitudeDeg: number | null;
};

export type UnitSystem = "metric" | "imperial";

export type RunSegment = {
  runId: string;
  routeId: string | null;
  activityDate: string;
  unitSystem: UnitSystem;
  segmentLengthValue: number;
  segmentLengthM: number;
  segmentLengthLabel: string;
  isCanonical: boolean;
  segmentIndex: number;
  segmentDistanceKm: number | null;
  segmentDurationSeconds: number | null;
  segmentPaceMinPerKm: number | null;
  avgSpeedKmh: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  avgRunningCadence: number | null;
  minAltitudeM: number | null;
  maxAltitudeM: number | null;
  elevationChangeM: number | null;
  segmentGrade: number | null;
  segmentStartDistanceKm: number | null;
  segmentEndDistanceKm: number | null;
  segmentStartBoundaryM: number | null;
  segmentEndBoundaryM: number | null;
  segmentStartLatitudeDeg: number | null;
  segmentStartLongitudeDeg: number | null;
  segmentEndLatitudeDeg: number | null;
  segmentEndLongitudeDeg: number | null;
};

export type DayRollup = {
  calendarDate: string;
  runCount: number;
  distanceKm: number;
  durationSeconds: number;
  longRunDistanceKm: number;
  activeDayFlag: boolean;
  rolling7dDistanceKm: number | null;
  rolling28dDistanceKm: number | null;
  restingHeartRate: number | null;
  hrvValue: number | null;
  sleepScore: number | null;
};

export type WeekRollup = {
  weekStartDate: string;
  weekEndDate: string;
  runsPerWeek: number;
  weeklyDistanceKm: number;
  weeklyDurationSeconds: number;
  avgPaceMinPerKm: number | null;
  longRunDistanceKm: number | null;
  longRunShareOfWeek: number | null;
  activeDays: number;
  missedDays: number;
  activeWeekFlag: boolean;
  rolling4wDistanceKm: number | null;
  rolling12wDistanceKm: number | null;
  activeWeekStreak: number | null;
  missedWeeks12w: number | null;
};

export type MonthRollup = {
  monthStartDate: string;
  calendarYear: number;
  calendarMonth: number;
  runsPerMonth: number;
  monthlyDistanceKm: number;
  monthlyDurationSeconds: number;
  longRunDistanceKm: number | null;
  activeDays: number;
};

export type YearRollup = {
  yearStartDate: string;
  calendarYear: number;
  runsPerYear: number;
  yearlyDistanceKm: number;
  yearlyDurationSeconds: number;
  longRunDistanceKm: number | null;
  activeDays: number;
};

export type VolumeData = {
  weeks: WeekRollup[];
  months: MonthRollup[];
  years: YearRollup[];
};

export type FitnessPoint = {
  activityId: string;
  activityDate: string;
  distanceKm: number | null;
  avgPaceMinPerKm: number | null;
  speedKmh: number | null;
  avgHeartRate: number | null;
  efficiencyRatio: number | null;
  rolling4RunEfficiencyRatio: number | null;
  hrDriftPct: number | null;
  rolling4RunHrDriftPct: number | null;
  hrBand: string | null;
  garminRecoveryHr: number | null;
  restingHeartRate: number | null;
  hrvValue: number | null;
  hrvStatus: string | null;
  sleepScore: number | null;
  sleepDurationSeconds: number | null;
};
