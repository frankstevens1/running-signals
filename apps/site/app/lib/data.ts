import "server-only";

import { goldTable, isDatabricksNotConfigured, queryDatabricks } from "./databricks";
import {
  mapDay,
  mapFitness,
  mapMonth,
  mapRoute,
  mapRun,
  mapSegment,
  mapWeek,
  mapYear,
  numberValue,
  stringValue,
} from "./mappers";
import type { RunFilters } from "./query";
import type {
  DashboardSummary,
  DataResult,
  DayRollup,
  FitnessPoint,
  LandingStatus,
  PaginatedResult,
  RouteSegment,
  RouteSummary,
  RunSession,
  VolumeData,
  WeekRollup,
} from "./types";

function asResult<T>(promise: Promise<T>): Promise<DataResult<T>> {
  return promise
    .then((data) => ({ status: "ok" as const, data }))
    .catch((error: unknown) => {
      if (isDatabricksNotConfigured(error)) {
        return {
          status: "not_configured" as const,
          message:
            error instanceof Error ? error.message : "Databricks SQL is not configured.",
        };
      }

      return {
        status: "error" as const,
        message: error instanceof Error ? error.message : "Unexpected data access error.",
      };
    });
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function optionalWhere(filters: RunFilters): string {
  const clauses: string[] = [];

  if (filters.dateFrom) clauses.push(`activity_date >= date(${sqlString(filters.dateFrom)})`);
  if (filters.dateTo) clauses.push(`activity_date <= date(${sqlString(filters.dateTo)})`);
  if (filters.minDistanceKm !== undefined) clauses.push(`distance_km >= ${filters.minDistanceKm}`);
  if (filters.maxDistanceKm !== undefined) clauses.push(`distance_km <= ${filters.maxDistanceKm}`);
  if (filters.minPace !== undefined) clauses.push(`avg_pace_min_per_km >= ${filters.minPace}`);
  if (filters.maxPace !== undefined) clauses.push(`avg_pace_min_per_km <= ${filters.maxPace}`);
  if (filters.minAvgHr !== undefined) clauses.push(`avg_heart_rate >= ${filters.minAvgHr}`);
  if (filters.maxAvgHr !== undefined) clauses.push(`avg_heart_rate <= ${filters.maxAvgHr}`);
  if (filters.routeId) clauses.push(`route_id = ${sqlString(filters.routeId)}`);
  if (filters.hasRecoveryHr === true) clauses.push("garmin_recovery_hr is not null");
  if (filters.hasRecoveryHr === false) clauses.push("garmin_recovery_hr is null");
  if (filters.minGpsCoverage !== undefined) {
    clauses.push(`record_distance_coverage_ratio >= ${filters.minGpsCoverage}`);
  }

  return clauses.length > 0 ? `where ${clauses.join("\n    and ")}` : "";
}

const RUN_SELECT = `
  run_id,
  activity_id,
  cast(activity_date as string) as activity_date,
  cast(start_time as string) as start_time,
  distance_km,
  duration_seconds,
  avg_pace_min_per_km,
  speed_kmh,
  avg_heart_rate,
  max_heart_rate,
  total_ascent,
  total_descent,
  garmin_recovery_hr,
  route_id,
  route_distance_bucket_km,
  record_distance_coverage_ratio,
  segment_count,
  avg_segment_grade,
  route_altitude_range_m,
  resting_heart_rate,
  hrv_value,
  hrv_status,
  sleep_score,
  sleep_duration_seconds,
  prior_7d_distance_km,
  prior_28d_distance_km
`;

async function queryLandingStatus(): Promise<LandingStatus> {
  const rows = await queryDatabricks(`
    select cast(max(calendar_date) as string) as latest_completed_date
    from ${goldTable("mart_days")}
    where is_completed_day = true
  `);
  const latestCompletedDate = stringValue(rows[0] ?? {}, "latest_completed_date");

  return {
    latestCompletedDate,
    statusLabel: latestCompletedDate ? "Gold marts current" : "No completed gold day",
    goldSchema: process.env.DATABRICKS_GOLD_SCHEMA ?? null,
  };
}

async function queryDashboard(): Promise<DashboardSummary> {
  const [summaryRows, latestRunRows] = await Promise.all([
    queryDatabricks(`
      with latest as (
        select max(calendar_date) as latest_completed_date
        from ${goldTable("mart_days")}
        where is_completed_day = true
      )
      select
        cast(latest.latest_completed_date as string) as latest_completed_date,
        sum(days.run_count) as total_runs,
        sum(days.distance_km) as total_distance_km,
        sum(case
          when days.calendar_date >= date_add(latest.latest_completed_date, -6)
          then days.distance_km else 0
        end)
          as recent_7d_distance_km,
        sum(case
          when days.calendar_date >= date_add(latest.latest_completed_date, -27)
          then days.distance_km else 0
        end)
          as recent_28d_distance_km,
        sum(case when days.has_hrv_payload then 1 else 0 end) as hrv_days,
        sum(case when days.has_rhr_payload then 1 else 0 end) as rhr_days,
        sum(case when days.has_sleep_payload then 1 else 0 end) as sleep_days,
        sum(case when days.has_heart_rates_payload then 1 else 0 end) as heart_rate_days
      from ${goldTable("mart_days")} as days
      cross join latest
      where days.is_completed_day = true
      group by latest.latest_completed_date
    `),
    queryDatabricks(`
      select ${RUN_SELECT}
      from ${goldTable("mart_run_sessions")}
      order by activity_date desc, start_time desc
      limit 1
    `),
  ]);

  const [activeWeekRows, activeMonthRows] = await Promise.all([
    queryDatabricks(`
      select count(*) as active_weeks
      from ${goldTable("mart_weeks")}
      where active_week_flag = true
    `),
    queryDatabricks(`
      select count(*) as active_months
      from ${goldTable("mart_months")}
      where runs_per_month > 0
    `),
  ]);

  const row = summaryRows[0] ?? {};

  return {
    latestCompletedDate: stringValue(row, "latest_completed_date"),
    totalRuns: numberValue(row, "total_runs") ?? 0,
    totalDistanceKm: numberValue(row, "total_distance_km") ?? 0,
    recent7dDistanceKm: numberValue(row, "recent_7d_distance_km") ?? 0,
    recent28dDistanceKm: numberValue(row, "recent_28d_distance_km") ?? 0,
    activeWeeks: numberValue(activeWeekRows[0] ?? {}, "active_weeks") ?? 0,
    activeMonths: numberValue(activeMonthRows[0] ?? {}, "active_months") ?? 0,
    healthCoverage: {
      hrvDays: numberValue(row, "hrv_days") ?? 0,
      rhrDays: numberValue(row, "rhr_days") ?? 0,
      sleepDays: numberValue(row, "sleep_days") ?? 0,
      heartRateDays: numberValue(row, "heart_rate_days") ?? 0,
    },
    latestRun: latestRunRows[0] ? mapRun(latestRunRows[0]) : null,
  };
}

async function queryRuns(filters: RunFilters): Promise<PaginatedResult<RunSession>> {
  const where = optionalWhere(filters);
  const [rows, countRows] = await Promise.all([
    queryDatabricks(`
      select ${RUN_SELECT}
      from ${goldTable("mart_run_sessions")}
      ${where}
      order by ${filters.sort} ${filters.direction}, activity_date desc
      limit ${filters.limit}
      offset ${filters.offset}
    `),
    queryDatabricks(`
      select count(*) as total
      from ${goldTable("mart_run_sessions")}
      ${where}
    `),
  ]);

  return {
    items: rows.map(mapRun),
    total: numberValue(countRows[0] ?? {}, "total") ?? 0,
    limit: filters.limit,
    offset: filters.offset,
  };
}

async function queryRoutes(limit = 50): Promise<RouteSummary[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const rows = await queryDatabricks(`
    select
      route_id,
      cast(first_observed_activity_date as string) as first_observed_activity_date,
      cast(latest_observed_activity_date as string) as latest_observed_activity_date,
      run_count,
      avg_distance_km,
      min_distance_km,
      max_distance_km,
      avg_duration_seconds,
      avg_pace_min_per_km,
      avg_heart_rate,
      avg_total_ascent,
      avg_total_descent,
      avg_segment_grade,
      avg_route_altitude_range_m,
      route_distance_bucket_km
    from ${goldTable("mart_routes")}
    order by run_count desc, latest_observed_activity_date desc
    limit ${safeLimit}
  `);

  return rows.map(mapRoute);
}

async function queryRouteSegments(routeId?: string, limit = 1200): Promise<RouteSegment[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 5000);
  const routeClause = routeId ? `and sessions.route_id = ${sqlString(routeId)}` : "";
  const rows = await queryDatabricks(`
    select
      segments.run_id,
      sessions.route_id,
      cast(segments.activity_date as string) as activity_date,
      segments.segment_index,
      segments.segment_distance_km,
      segments.avg_heart_rate,
      segments.segment_start_latitude_deg,
      segments.segment_start_longitude_deg,
      segments.segment_end_latitude_deg,
      segments.segment_end_longitude_deg
    from ${goldTable("mart_run_segments")} as segments
    inner join ${goldTable("mart_run_sessions")} as sessions
      on segments.run_id = sessions.run_id
    where segments.segment_start_latitude_deg is not null
      and segments.segment_start_longitude_deg is not null
      and segments.segment_end_latitude_deg is not null
      and segments.segment_end_longitude_deg is not null
      ${routeClause}
    order by segments.activity_date desc, segments.run_id, segments.segment_index
    limit ${safeLimit}
  `);

  return rows.map(mapSegment);
}

async function queryDays(limit = 371): Promise<DayRollup[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 1200);
  const rows = await queryDatabricks(`
    select
      cast(calendar_date as string) as calendar_date,
      run_count,
      distance_km,
      duration_seconds,
      long_run_distance_km,
      active_day_flag,
      rolling_7d_distance_km,
      rolling_28d_distance_km,
      resting_heart_rate,
      hrv_value,
      sleep_score
    from ${goldTable("mart_days")}
    where is_completed_day = true
    order by calendar_date desc
    limit ${safeLimit}
  `);

  return rows.map(mapDay).reverse();
}

async function queryWeeksRaw(limit = 104): Promise<WeekRollup[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 260);
  const rows = await queryDatabricks(`
    select
      cast(week_start_date as string) as week_start_date,
      cast(week_end_date as string) as week_end_date,
      runs_per_week,
      weekly_distance_km,
      weekly_duration_seconds,
      avg_pace_min_per_km,
      long_run_distance_km,
      long_run_share_of_week,
      active_days,
      missed_days,
      active_week_flag,
      rolling_4w_distance_km,
      rolling_12w_distance_km,
      active_week_streak,
      missed_weeks_12w
    from ${goldTable("mart_weeks")}
    order by week_start_date desc
    limit ${safeLimit}
  `);

  return rows.map(mapWeek).reverse();
}

async function queryVolume(): Promise<VolumeData> {
  const [weeks, months, years] = await Promise.all([
    queryWeeksRaw(104),
    queryDatabricks(`
      select
        cast(month_start_date as string) as month_start_date,
        calendar_year,
        calendar_month,
        runs_per_month,
        monthly_distance_km,
        monthly_duration_seconds,
        long_run_distance_km,
        active_days
      from ${goldTable("mart_months")}
      order by month_start_date desc
      limit 36
    `).then((rows) => rows.map(mapMonth).reverse()),
    queryDatabricks(`
      select
        cast(year_start_date as string) as year_start_date,
        calendar_year,
        runs_per_year,
        yearly_distance_km,
        yearly_duration_seconds,
        long_run_distance_km,
        active_days
      from ${goldTable("mart_years")}
      order by year_start_date desc
      limit 10
    `).then((rows) => rows.map(mapYear).reverse()),
  ]);

  return { weeks, months, years };
}

async function queryFitness(limit = 150): Promise<FitnessPoint[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const rows = await queryDatabricks(`
    select
      activity_id,
      cast(activity_date as string) as activity_date,
      distance_km,
      avg_pace_min_per_km,
      speed_kmh,
      avg_heart_rate,
      efficiency_ratio,
      rolling_4_run_efficiency_ratio,
      hr_drift_pct,
      rolling_4_run_hr_drift_pct,
      hr_band,
      garmin_recovery_hr,
      resting_heart_rate,
      hrv_value,
      hrv_status,
      sleep_score,
      sleep_duration_seconds
    from ${goldTable("signal_fitness")}
    order by activity_date desc, activity_id desc
    limit ${safeLimit}
  `);

  return rows.map(mapFitness).reverse();
}

export function getDashboardSummary(): Promise<DataResult<DashboardSummary>> {
  return asResult(queryDashboard());
}

export function getLandingStatus(): Promise<DataResult<LandingStatus>> {
  return asResult(queryLandingStatus());
}

export function getRuns(filters: RunFilters): Promise<DataResult<PaginatedResult<RunSession>>> {
  return asResult(queryRuns(filters));
}

export function getRoutes(limit?: number): Promise<DataResult<RouteSummary[]>> {
  return asResult(queryRoutes(limit));
}

export function getRouteSegments(
  routeId?: string,
  limit?: number,
): Promise<DataResult<RouteSegment[]>> {
  return asResult(queryRouteSegments(routeId, limit));
}

export function getDays(limit?: number): Promise<DataResult<DayRollup[]>> {
  return asResult(queryDays(limit));
}

export function getWeeks(limit?: number): Promise<DataResult<WeekRollup[]>> {
  return asResult(queryWeeksRaw(limit));
}

export function getVolume(): Promise<DataResult<VolumeData>> {
  return asResult(queryVolume());
}

export function getFitness(limit?: number): Promise<DataResult<FitnessPoint[]>> {
  return asResult(queryFitness(limit));
}
