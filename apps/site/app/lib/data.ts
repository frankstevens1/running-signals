import "server-only";

import { amsterdamToday, type DateWindow } from "./analytics-window";
import { daysInWeekToDate, weekStartDate, type CurrentWeekToDate } from "./current-week";
import {
  mapDay, mapFitness, mapMapProfileRecord, mapRoute, mapRun,
  mapRunFilterBounds, mapSegment, mapWeek, numberValue, stringValue,
} from "./mappers";
import { sampleMapProfileRecords } from "./map-records";
import type { RunFilters } from "./query";
import {
  isSupabaseNotConfigured, querySupabase, querySupabaseRpc,
  type SupabaseFilter, type SupabaseOrder,
} from "./supabase";
import type {
  DashboardSummary, DataResult, DayRollup, FitnessPoint, LandingStatus,
  MapProfileRecord, PaginatedResult, RouteSummary, RunFilterBounds,
  RunSegment, RunSession, UnitSystem, VolumeData, WeekRollup, WeekStreakRecord,
} from "./types";
import { monthsFromDays, yearsFromDays } from "./volume-rollups";

const RUN_SELECT = [
  "run_id", "activity_id", "activity_date", "start_time", "distance_km",
  "duration_seconds", "avg_pace_min_per_km", "speed_kmh", "avg_heart_rate",
  "max_heart_rate", "total_ascent", "total_descent", "garmin_recovery_hr",
  "route_id", "route_distance_bucket_km", "record_distance_coverage_ratio",
  "segment_count", "avg_segment_grade", "route_altitude_range_m",
  "prior_7d_distance_km", "prior_28d_distance_km",
].join(",");
const DAY_SELECT = [
  "calendar_date", "run_count", "distance_km", "duration_seconds",
  "long_run_distance_km", "active_day_flag", "rolling_7d_distance_km",
  "rolling_28d_distance_km",
].join(",");
const FITNESS_SELECT = [
  "activity_id", "activity_date", "distance_km", "avg_pace_min_per_km", "speed_kmh",
  "avg_heart_rate", "efficiency_ratio", "rolling_4_run_efficiency_ratio",
  "hr_drift_pct", "rolling_4_run_hr_drift_pct", "rolling_4_run_recovery_hr",
  "rolling_4_week_recovery_hr", "hr_band", "garmin_recovery_hr",
].join(",");
const ROUTE_SELECT = [
  "route_id", "latest_observed_activity_date", "run_count", "avg_distance_km",
  "avg_pace_min_per_km", "avg_heart_rate",
  "representative_route_centroid_latitude_deg",
  "representative_route_centroid_longitude_deg", "total_count",
].join(",");
const MAP_RECORD_SELECT = [
  "record_index", "record_distance_km", "altitude_m", "position_lat_deg",
  "position_long_deg",
].join(",");
const SEGMENT_SELECT = [
  "run_id", "unit_system", "segment_length_value", "segment_index",
  "segment_distance_km", "segment_duration_seconds", "segment_pace_min_per_km",
  "avg_heart_rate", "max_heart_rate", "avg_running_cadence", "elevation_change_m",
  "segment_grade", "segment_start_distance_km", "segment_end_distance_km",
].join(",");
const FILTER_BOUNDS_SELECT = [
  "min_activity_date", "max_activity_date", "min_distance_km", "max_distance_km",
  "min_pace_min_per_km", "max_pace_min_per_km", "min_avg_heart_rate",
  "max_avg_heart_rate", "min_gps_coverage", "max_gps_coverage",
  "min_route_altitude_range_m", "max_route_altitude_range_m",
].join(",");
const PERIOD_SUMMARY_SELECT = [
  "latest_completed_date", "total_runs", "total_distance_km", "recent_7d_distance_km",
  "recent_28d_distance_km", "active_weeks", "active_months",
].join(",");
const WEEK_SELECT = [
  "week_start_date", "week_end_date", "runs_per_week", "weekly_distance_km",
  "avg_run_distance_km", "weekly_duration_seconds", "avg_pace_min_per_km",
  "long_run_distance_km", "long_run_share_of_week", "active_days", "missed_days",
  "active_week_flag", "rolling_4w_distance_km", "rolling_12w_distance_km",
  "active_week_streak", "missed_weeks_12w",
].join(",");

function asResult<T>(promise: Promise<T>): Promise<DataResult<T>> {
  return promise.then((data) => ({ status: "ok" as const, data })).catch((error: unknown) => {
    if (isSupabaseNotConfigured(error)) {
      return {
        status: "not_configured" as const,
        message: error instanceof Error ? error.message : "Supabase is not configured.",
      };
    }
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unexpected data access error.",
    };
  });
}

function dateFilters(column: string, window: DateWindow): SupabaseFilter[] {
  const filters: SupabaseFilter[] = [];
  if (window.from) filters.push({ column, operator: "gte", value: window.from });
  if (window.to) filters.push({ column, operator: "lte", value: window.to });
  return filters;
}

function addOptionalNumberFilter(
  filters: SupabaseFilter[], column: string, operator: "gte" | "lte",
  value: number | undefined,
) {
  if (value !== undefined) filters.push({ column, operator, value });
}

function runFilters(filters: RunFilters, window: DateWindow): SupabaseFilter[] | null {
  const from = [filters.dateFrom, window.from]
    .filter((value): value is string => Boolean(value)).sort().at(-1);
  const to = [filters.dateTo, window.to]
    .filter((value): value is string => Boolean(value)).sort().at(0);
  if (from && to && from > to) return null;
  const result: SupabaseFilter[] = [];
  if (from) result.push({ column: "activity_date", operator: "gte", value: from });
  if (to) result.push({ column: "activity_date", operator: "lte", value: to });
  addOptionalNumberFilter(result, "distance_km", "gte", filters.minDistanceKm);
  addOptionalNumberFilter(result, "distance_km", "lte", filters.maxDistanceKm);
  addOptionalNumberFilter(result, "avg_pace_min_per_km", "gte", filters.minPace);
  addOptionalNumberFilter(result, "avg_pace_min_per_km", "lte", filters.maxPace);
  addOptionalNumberFilter(result, "avg_heart_rate", "gte", filters.minAvgHr);
  addOptionalNumberFilter(result, "avg_heart_rate", "lte", filters.maxAvgHr);
  addOptionalNumberFilter(result, "record_distance_coverage_ratio", "gte", filters.minGpsCoverage);
  addOptionalNumberFilter(result, "route_altitude_range_m", "gte", filters.minAltitudeRange);
  if (filters.routeId) result.push({ column: "route_id", operator: "eq", value: filters.routeId });
  if (filters.hasRecoveryHr === true) {
    result.push({ column: "garmin_recovery_hr", operator: "not.is", value: null });
  } else if (filters.hasRecoveryHr === false) {
    result.push({ column: "garmin_recovery_hr", operator: "is", value: null });
  }
  return result;
}

function runOrder(filters: RunFilters): SupabaseOrder[] {
  const order: SupabaseOrder[] = [
    { column: filters.sort, direction: filters.direction, nulls: "last" },
  ];
  if (filters.sort !== "activity_date") {
    order.push({ column: "activity_date", direction: "desc", nulls: "last" });
  }
  order.push({ column: "start_time", direction: "desc", nulls: "last" });
  order.push({ column: "run_id", direction: "asc", nulls: "last" });
  return order;
}

async function queryLandingStatus(): Promise<LandingStatus> {
  const result = await querySupabase("site_days", {
    select: "calendar_date",
    order: [{ column: "calendar_date", direction: "desc", nulls: "last" }],
    limit: 1,
  });
  const latestCompletedDate = stringValue(result.rows[0] ?? {}, "calendar_date");
  return {
    latestCompletedDate,
    statusLabel: latestCompletedDate ? "Modeled data available" : "No modeled data available",
  };
}

async function queryCurrentWeekAligned(): Promise<CurrentWeekToDate> {
  const today = amsterdamToday();
  const weekStart = weekStartDate(today);
  const [daysResult, todayRunsResult] = await Promise.all([
    querySupabase("site_days", {
      select: DAY_SELECT,
      filters: dateFilters("calendar_date", { from: weekStart, to: today }),
      order: [{ column: "calendar_date", direction: "asc", nulls: "last" }],
    }),
    querySupabase("site_runs", {
      select: "run_id,distance_km",
      filters: dateFilters("activity_date", { from: today, to: today }),
    }),
  ]);
  const days = daysResult.rows.map(mapDay);
  const includeLiveToday = days.at(-1)?.calendarDate !== today;
  const todayRunCount = includeLiveToday ? todayRunsResult.rows.length : 0;
  return {
    weekStartDate: weekStart,
    latestCompletedDate: days.at(-1)?.calendarDate ?? null,
    includesLiveToday: includeLiveToday,
    runCount: days.reduce((total, day) => total + day.runCount, 0) + todayRunCount,
    distanceKm: days.reduce((total, day) => total + day.distanceKm, 0)
      + (includeLiveToday
        ? todayRunsResult.rows.reduce((total, row) => total + (numberValue(row, "distance_km") ?? 0), 0)
        : 0),
    activeDays: days.filter((day) => day.activeDayFlag).length + (todayRunCount > 0 ? 1 : 0),
    daysSoFar: daysInWeekToDate(today),
  };
}

async function queryWeekStreakRecord(): Promise<WeekStreakRecord> {
  const result = await querySupabase("site_weeks", {
    select: "active_week_streak",
    order: [{ column: "active_week_streak", direction: "desc", nulls: "last" }],
    limit: 1,
  });
  return { longestActiveWeekStreak: numberValue(result.rows[0] ?? {}, "active_week_streak") ?? 0 };
}

async function queryDashboard(window: DateWindow): Promise<DashboardSummary> {
  const [rows, latestRun] = await Promise.all([
    querySupabaseRpc(
      "site_period_summary", { p_from: window.from, p_to: window.to }, PERIOD_SUMMARY_SELECT,
    ),
    querySupabase("site_runs", {
      select: RUN_SELECT,
      filters: dateFilters("activity_date", window),
      order: [
        { column: "activity_date", direction: "desc", nulls: "last" },
        { column: "start_time", direction: "desc", nulls: "last" },
        { column: "run_id", direction: "asc", nulls: "last" },
      ],
      limit: 1,
    }),
  ]);
  const row = rows[0] ?? {};
  return {
    latestCompletedDate: stringValue(row, "latest_completed_date"),
    totalRuns: numberValue(row, "total_runs") ?? 0,
    totalDistanceKm: numberValue(row, "total_distance_km") ?? 0,
    recent7dDistanceKm: numberValue(row, "recent_7d_distance_km") ?? 0,
    recent28dDistanceKm: numberValue(row, "recent_28d_distance_km") ?? 0,
    activeWeeks: numberValue(row, "active_weeks") ?? 0,
    activeMonths: numberValue(row, "active_months") ?? 0,
    latestRun: latestRun.rows[0] ? mapRun(latestRun.rows[0]) : null,
  };
}

async function queryRuns(
  filters: RunFilters, window: DateWindow,
): Promise<PaginatedResult<RunSession>> {
  const filtersForQuery = runFilters(filters, window);
  if (filtersForQuery === null) {
    return { items: [], total: 0, limit: filters.limit, offset: filters.offset };
  }
  const result = await querySupabase("site_runs", {
    select: RUN_SELECT,
    filters: filtersForQuery,
    order: runOrder(filters),
    limit: filters.limit,
    offset: filters.offset,
    count: "exact",
  });
  if (result.count === null) throw new Error("Supabase did not return an exact run count.");
  return {
    items: result.rows.map(mapRun), total: result.count,
    limit: filters.limit, offset: filters.offset,
  };
}

async function queryRunFilterBounds(window: DateWindow): Promise<RunFilterBounds> {
  const rows = await querySupabaseRpc(
    "site_run_filter_bounds_for_window", { p_from: window.from, p_to: window.to },
    FILTER_BOUNDS_SELECT,
  );
  return mapRunFilterBounds(rows[0] ?? {});
}

async function queryRoutes(window: DateWindow): Promise<RouteSummary[]> {
  const pageSize = 1000;
  const rows: Record<string, unknown>[] = [];
  let total = Number.POSITIVE_INFINITY;
  while (rows.length < total) {
    const page = await querySupabaseRpc(
      "site_route_summaries",
      { p_from: window.from, p_to: window.to, p_limit: pageSize, p_offset: rows.length },
      ROUTE_SELECT,
    );
    if (page.length === 0) break;
    rows.push(...page);
    total = numberValue(page[0] ?? {}, "total_count") ?? rows.length;
    if (page.length < pageSize) break;
  }
  return rows.map(mapRoute).sort((left, right) =>
    right.runCount - left.runCount
    || (right.latestObservedActivityDate ?? "").localeCompare(left.latestObservedActivityDate ?? "")
    || left.routeId.localeCompare(right.routeId));
}

async function queryMapRecords(parameters: { p_route_id?: string; p_run_id?: string }) {
  const rows = await querySupabaseRpc("site_map_profile_records", parameters, MAP_RECORD_SELECT);
  return sampleMapProfileRecords(rows.map(mapMapProfileRecord));
}

async function queryRunSegments(
  runId: string, unitSystem: UnitSystem, segmentLengthValue: number, limit = 1200,
): Promise<RunSegment[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 5000);
  const rows: Record<string, unknown>[] = [];
  while (rows.length < safeLimit) {
    const pageLimit = Math.min(1000, safeLimit - rows.length);
    const result = await querySupabase("site_route_segments", {
      select: SEGMENT_SELECT,
      filters: [
        { column: "run_id", operator: "eq", value: runId },
        { column: "unit_system", operator: "eq", value: unitSystem },
        { column: "segment_length_value", operator: "eq", value: segmentLengthValue },
      ],
      order: [{ column: "segment_index", direction: "asc", nulls: "last" }],
      limit: pageLimit,
      offset: rows.length,
    });
    rows.push(...result.rows);
    if (result.rows.length < pageLimit) break;
  }
  return rows.map(mapSegment);
}

async function queryDays(window: DateWindow): Promise<DayRollup[]> {
  const rows: Record<string, unknown>[] = [];
  while (true) {
    const result = await querySupabase("site_days", {
      select: DAY_SELECT,
      filters: dateFilters("calendar_date", window),
      order: [{ column: "calendar_date", direction: "asc", nulls: "last" }],
      limit: 1000,
      offset: rows.length,
    });
    rows.push(...result.rows);
    if (result.rows.length < 1000) break;
  }
  return rows.map(mapDay);
}

async function queryWeeks(window: DateWindow): Promise<WeekRollup[]> {
  const rows: Record<string, unknown>[] = [];
  while (true) {
    const result = await querySupabase("site_weeks", {
      select: WEEK_SELECT,
      filters: dateFilters("week_start_date", window),
      order: [{ column: "week_start_date", direction: "asc", nulls: "last" }],
      limit: 1000,
      offset: rows.length,
    });
    rows.push(...result.rows);
    if (result.rows.length < 1000) break;
  }
  return rows.map(mapWeek);
}

async function queryVolume(window: DateWindow): Promise<VolumeData> {
  const [weeks, days] = await Promise.all([queryWeeks(window), queryDays(window)]);
  return {
    weeks,
    months: monthsFromDays(days),
    years: yearsFromDays(days),
    totalRuns: days.reduce((sum, day) => sum + day.runCount, 0),
    totalDistanceKm: days.reduce((sum, day) => sum + day.distanceKm, 0),
    activeDays: days.filter((day) => day.activeDayFlag).length,
    latestDate: days.at(-1)?.calendarDate ?? null,
  };
}

async function queryFitness(window: DateWindow): Promise<FitnessPoint[]> {
  const rows: Record<string, unknown>[] = [];
  while (true) {
    const result = await querySupabase("site_fitness", {
      select: FITNESS_SELECT,
      filters: dateFilters("activity_date", window),
      order: [
        { column: "activity_date", direction: "asc", nulls: "last" },
        { column: "activity_id", direction: "asc", nulls: "last" },
      ],
      limit: 1000,
      offset: rows.length,
    });
    rows.push(...result.rows);
    if (result.rows.length < 1000) break;
  }
  return rows.map(mapFitness);
}

export function getDashboardSummary(window: DateWindow) { return asResult(queryDashboard(window)); }
export function getLandingStatus() { return asResult(queryLandingStatus()); }
export function getCurrentWeekAligned() { return asResult(queryCurrentWeekAligned()); }
export function getRuns(filters: RunFilters, window: DateWindow) {
  return asResult(queryRuns(filters, window));
}
export function getRunFilterBounds(window: DateWindow) { return asResult(queryRunFilterBounds(window)); }
export function getRoutes(window: DateWindow) { return asResult(queryRoutes(window)); }
export function getRouteRecords(routeId: string): Promise<DataResult<MapProfileRecord[]>> {
  return asResult(queryMapRecords({ p_route_id: routeId }));
}
export function getRunRecords(runId: string): Promise<DataResult<MapProfileRecord[]>> {
  return asResult(queryMapRecords({ p_run_id: runId }));
}
export function getRunSegments(
  runId: string, unitSystem: UnitSystem, segmentLengthValue: number, limit?: number,
) { return asResult(queryRunSegments(runId, unitSystem, segmentLengthValue, limit)); }
export function getDays(window: DateWindow) { return asResult(queryDays(window)); }
export function getWeeks(window: DateWindow) { return asResult(queryWeeks(window)); }
export function getWeekStreakRecord() { return asResult(queryWeekStreakRecord()); }
export function getVolume(window: DateWindow) { return asResult(queryVolume(window)); }
export function getFitness(window: DateWindow) { return asResult(queryFitness(window)); }
