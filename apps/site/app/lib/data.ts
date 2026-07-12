import "server-only";

import { goldTable, isDatabricksNotConfigured, queryDatabricks } from "./databricks";
import {
  isSupabaseNotConfigured,
  querySupabase,
  type SupabaseFilter,
  type SupabaseOrder,
} from "./supabase";
import {
  mapDay,
  mapActivityRecord,
  mapFitness,
  mapMonth,
  mapRoute,
  mapRouteGeometryRecord,
  mapRun,
  mapSegment,
  mapWeek,
  mapYear,
  numberValue,
  stringValue,
} from "./mappers";
import type { RunFilters } from "./query";
import type {
  ActivityRecord,
  DashboardSummary,
  DataResult,
  DayRollup,
  FitnessPoint,
  LandingStatus,
  PaginatedResult,
  RouteGeometryRecord,
  RouteSummary,
  RunSegment,
  RunSession,
  VolumeData,
  WeekRollup,
  UnitSystem,
} from "./types";

type SiteDataSource = "supabase" | "databricks";

function getSiteDataSource(): SiteDataSource {
  return process.env.SITE_DATA_SOURCE === "databricks" ? "databricks" : "supabase";
}

function isDataSourceNotConfigured(error: unknown): boolean {
  return isDatabricksNotConfigured(error) || isSupabaseNotConfigured(error);
}

function asResult<T>(promise: Promise<T>): Promise<DataResult<T>> {
  return promise
    .then((data) => ({ status: "ok" as const, data }))
    .catch((error: unknown) => {
      if (isDataSourceNotConfigured(error)) {
        return {
          status: "not_configured" as const,
          message:
            error instanceof Error ? error.message : "Site data source is not configured.",
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

function addOptionalNumberFilter(
  filters: SupabaseFilter[],
  column: string,
  operator: "gte" | "lte",
  value: number | undefined,
): void {
  if (value !== undefined) {
    filters.push({ column, operator, value });
  }
}

function supabaseRunFilters(filters: RunFilters): SupabaseFilter[] {
  const result: SupabaseFilter[] = [];

  if (filters.dateFrom) {
    result.push({ column: "activity_date", operator: "gte", value: filters.dateFrom });
  }

  if (filters.dateTo) {
    result.push({ column: "activity_date", operator: "lte", value: filters.dateTo });
  }

  addOptionalNumberFilter(result, "distance_km", "gte", filters.minDistanceKm);
  addOptionalNumberFilter(result, "distance_km", "lte", filters.maxDistanceKm);
  addOptionalNumberFilter(result, "avg_pace_min_per_km", "gte", filters.minPace);
  addOptionalNumberFilter(result, "avg_pace_min_per_km", "lte", filters.maxPace);
  addOptionalNumberFilter(result, "avg_heart_rate", "gte", filters.minAvgHr);
  addOptionalNumberFilter(result, "avg_heart_rate", "lte", filters.maxAvgHr);
  addOptionalNumberFilter(
    result,
    "record_distance_coverage_ratio",
    "gte",
    filters.minGpsCoverage,
  );

  if (filters.routeId) {
    result.push({ column: "route_id", operator: "eq", value: filters.routeId });
  }

  if (filters.hasRecoveryHr === true) {
    result.push({ column: "garmin_recovery_hr", operator: "not.is", value: null });
  }

  if (filters.hasRecoveryHr === false) {
    result.push({ column: "garmin_recovery_hr", operator: "is", value: null });
  }

  return result;
}

function supabaseRunOrder(filters: RunFilters): SupabaseOrder[] {
  const order: SupabaseOrder[] = [
    { column: filters.sort, direction: filters.direction, nulls: "last" },
  ];

  if (filters.sort !== "activity_date") {
    order.push({ column: "activity_date", direction: "desc", nulls: "last" });
  }

  order.push({ column: "start_time", direction: "desc", nulls: "last" });

  return order;
}

function metadataString(row: Record<string, unknown> | undefined): string | null {
  const value = row?.metadata_value;

  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;

  return String(value);
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

const RUN_SEGMENT_SELECT = `
  segments.run_id,
  sessions.route_id,
  cast(segments.activity_date as string) as activity_date,
  segments.unit_system,
  segments.segment_length_value,
  segments.segment_length_m,
  segments.segment_length_label,
  segments.is_canonical,
  segments.segment_index,
  segments.segment_distance_km,
  segments.segment_duration_seconds,
  segments.segment_pace_min_per_km,
  segments.avg_speed_kmh,
  segments.avg_heart_rate,
  segments.max_heart_rate,
  segments.avg_running_cadence,
  segments.min_altitude_m,
  segments.max_altitude_m,
  segments.elevation_change_m,
  segments.segment_grade,
  segments.segment_start_distance_m / 1000.0 as segment_start_distance_km,
  segments.segment_end_distance_m / 1000.0 as segment_end_distance_km,
  segments.segment_start_boundary_m,
  segments.segment_end_boundary_m,
  segments.segment_start_latitude_deg,
  segments.segment_start_longitude_deg,
  segments.segment_end_latitude_deg,
  segments.segment_end_longitude_deg
`;

const ACTIVITY_RECORD_SELECT = `
  records.activity_id,
  cast(records.activity_date as string) as activity_date,
  records.run_id,
  cast(records.record_timestamp as string) as record_timestamp,
  records.record_index,
  records.elapsed_seconds,
  records.seconds_since_previous_record,
  records.record_distance_m,
  records.record_distance_km,
  records.distance_delta_m,
  records.speed_mps,
  records.speed_kmh,
  records.pace_min_per_km,
  records.heart_rate,
  records.running_cadence,
  records.altitude_m,
  records.altitude_delta_m,
  records.temperature,
  records.position_lat_deg,
  records.position_long_deg
`;

async function queryLandingStatusFromDatabricks(): Promise<LandingStatus> {
  const rows = await queryDatabricks(`
    select cast(max(calendar_date) as string) as latest_completed_date
    from ${goldTable("mart_days")}
    where is_completed_day = true
  `);
  const latestCompletedDate = stringValue(rows[0] ?? {}, "latest_completed_date");

  return {
    latestCompletedDate,
    statusLabel: latestCompletedDate ? "Modeled data available" : "No modeled data available",
    goldSchema: process.env.DATABRICKS_GOLD_SCHEMA ?? null,
  };
}

async function queryLandingStatusFromSupabase(): Promise<LandingStatus> {
  const [summaryResult, schemaResult] = await Promise.all([
    querySupabase("site_dashboard_summary", { limit: 1 }),
    querySupabase("site_metadata", {
      filters: [{ column: "metadata_key", operator: "eq", value: "databricks_gold_schema" }],
      limit: 1,
    }),
  ]);
  const latestCompletedDate = stringValue(summaryResult.rows[0] ?? {}, "latest_completed_date");

  return {
    latestCompletedDate,
    statusLabel: latestCompletedDate ? "Modeled data available" : "No modeled data available",
    goldSchema: metadataString(schemaResult.rows[0]),
  };
}

async function queryDashboardFromDatabricks(): Promise<DashboardSummary> {
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

async function queryDashboardFromSupabase(): Promise<DashboardSummary> {
  const [summaryResult, latestRunResult] = await Promise.all([
    querySupabase("site_dashboard_summary", { limit: 1 }),
    querySupabase("site_runs", {
      order: [
        { column: "activity_date", direction: "desc", nulls: "last" },
        { column: "start_time", direction: "desc", nulls: "last" },
      ],
      limit: 1,
    }),
  ]);
  const row = summaryResult.rows[0] ?? {};

  return {
    latestCompletedDate: stringValue(row, "latest_completed_date"),
    totalRuns: numberValue(row, "total_runs") ?? 0,
    totalDistanceKm: numberValue(row, "total_distance_km") ?? 0,
    recent7dDistanceKm: numberValue(row, "recent_7d_distance_km") ?? 0,
    recent28dDistanceKm: numberValue(row, "recent_28d_distance_km") ?? 0,
    activeWeeks: numberValue(row, "active_weeks") ?? 0,
    activeMonths: numberValue(row, "active_months") ?? 0,
    healthCoverage: {
      hrvDays: numberValue(row, "hrv_days") ?? 0,
      rhrDays: numberValue(row, "rhr_days") ?? 0,
      sleepDays: numberValue(row, "sleep_days") ?? 0,
      heartRateDays: numberValue(row, "heart_rate_days") ?? 0,
    },
    latestRun: latestRunResult.rows[0] ? mapRun(latestRunResult.rows[0]) : null,
  };
}

async function queryRunsFromDatabricks(
  filters: RunFilters,
): Promise<PaginatedResult<RunSession>> {
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

async function queryRunsFromSupabase(
  filters: RunFilters,
): Promise<PaginatedResult<RunSession>> {
  const queryFilters = supabaseRunFilters(filters);

  try {
    const result = await querySupabase("site_runs", {
      filters: queryFilters,
      order: supabaseRunOrder(filters),
      limit: filters.limit,
      offset: filters.offset,
      count: "exact",
    });

    return {
      items: result.rows.map(mapRun),
      total: result.count ?? result.rows.length,
      limit: filters.limit,
      offset: filters.offset,
    };
  } catch {
    const fallbackLimit = Math.min(filters.limit + 1, 101);
    const result = await querySupabase("site_runs", {
      filters: queryFilters,
      order: [{ column: filters.sort, direction: filters.direction, nulls: "last" }],
      limit: fallbackLimit,
      offset: filters.offset,
    });
    const hasMore = result.rows.length > filters.limit;
    const visibleRows = hasMore ? result.rows.slice(0, filters.limit) : result.rows;

    return {
      items: visibleRows.map(mapRun),
      total: filters.offset + visibleRows.length + (hasMore ? 1 : 0),
      limit: filters.limit,
      offset: filters.offset,
    };
  }
}

async function queryRoutesFromDatabricks(limit = 50): Promise<RouteSummary[]> {
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

async function queryRoutesFromSupabase(limit = 50): Promise<RouteSummary[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const result = await querySupabase("site_routes", {
    order: [
      { column: "run_count", direction: "desc", nulls: "last" },
      { column: "latest_observed_activity_date", direction: "desc", nulls: "last" },
    ],
    limit: safeLimit,
  });

  return result.rows.map(mapRoute);
}

async function queryRouteRecordsFromDatabricks(
  routeIds: readonly string[],
): Promise<RouteGeometryRecord[]> {
  if (routeIds.length === 0) return [];

  const routeIdList = routeIds.map(sqlString).join(", ");
  const rows = await queryDatabricks(`
    select
      records.run_id,
      routes.route_id,
      records.record_index,
      records.position_lat_deg,
      records.position_long_deg
    from ${goldTable("mart_activity_records")} as records
    inner join ${goldTable("mart_routes")} as routes
      on records.run_id = routes.route_representative_run_id
    where routes.route_id in (${routeIdList})
    order by routes.route_id, records.run_id, records.record_index
  `);

  return rows.map(mapRouteGeometryRecord);
}

const ROUTE_ID_CHUNK_SIZE = 25;
const ROUTE_RECORD_PAGE_SIZE = 1000;

function routeIdChunks(routeIds: readonly string[]): string[][] {
  const uniqueRouteIds = Array.from(new Set(routeIds.filter(Boolean))).slice(0, 100);
  const chunks: string[][] = [];

  for (let index = 0; index < uniqueRouteIds.length; index += ROUTE_ID_CHUNK_SIZE) {
    chunks.push(uniqueRouteIds.slice(index, index + ROUTE_ID_CHUNK_SIZE));
  }

  return chunks;
}

function compareRouteGeometryRecords(
  left: RouteGeometryRecord,
  right: RouteGeometryRecord,
): number {
  if (left.routeId !== right.routeId) return left.routeId < right.routeId ? -1 : 1;
  if (left.runId !== right.runId) return left.runId < right.runId ? -1 : 1;
  return left.recordIndex - right.recordIndex;
}

async function queryRouteRecordChunkFromSupabase(
  routeIds: readonly string[],
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];

  while (true) {
    const result = await querySupabase("site_activity_records", {
      select: "route_id,run_id,record_index,position_lat_deg,position_long_deg",
      filters: [
        { column: "is_route_representative", operator: "eq", value: true },
        { column: "route_id", operator: "in", value: routeIds },
      ],
      order: [
        { column: "route_id", direction: "asc", nulls: "last" },
        { column: "run_id", direction: "asc", nulls: "last" },
        { column: "record_index", direction: "asc", nulls: "last" },
      ],
      limit: ROUTE_RECORD_PAGE_SIZE,
      offset: rows.length,
    });

    rows.push(...result.rows);
    if (result.rows.length < ROUTE_RECORD_PAGE_SIZE) break;
  }

  return rows;
}

async function queryRouteRecordsFromSupabase(
  routeIds: readonly string[],
): Promise<RouteGeometryRecord[]> {
  const chunks = routeIdChunks(routeIds);
  if (chunks.length === 0) return [];

  const chunkRows = await Promise.all(chunks.map(queryRouteRecordChunkFromSupabase));
  return chunkRows.flat().map(mapRouteGeometryRecord).sort(compareRouteGeometryRecords);
}

async function queryRunRecordsFromDatabricks(
  runId: string,
): Promise<ActivityRecord[]> {
  const rows = await queryDatabricks(`
    select
      ${ACTIVITY_RECORD_SELECT},
      sessions.route_id,
      records.run_id = sessions.route_representative_run_id as is_route_representative
    from ${goldTable("mart_activity_records")} as records
    left join ${goldTable("mart_run_sessions")} as sessions
      on records.run_id = sessions.run_id
    where records.run_id = ${sqlString(runId)}
    order by records.record_index
  `);

  return rows.map(mapActivityRecord);
}

async function queryRunRecordsFromSupabase(
  runId: string,
): Promise<ActivityRecord[]> {
  const pageSize = 1000;
  const rows: Record<string, unknown>[] = [];

  while (true) {
    const result = await querySupabase("site_activity_records", {
      filters: [{ column: "run_id", operator: "eq", value: runId }],
      order: [{ column: "record_index", direction: "asc", nulls: "last" }],
      limit: pageSize,
      offset: rows.length,
    });

    rows.push(...result.rows);
    if (result.rows.length < pageSize) break;
  }

  return rows.map(mapActivityRecord);
}

async function queryRunSegmentsFromDatabricks(
  runId: string,
  unitSystem: UnitSystem,
  segmentLengthValue: number,
  limit = 1200,
): Promise<RunSegment[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 5000);
  const rows = await queryDatabricks(`
    select
      ${RUN_SEGMENT_SELECT}
    from ${goldTable("mart_run_segments")} as segments
    inner join ${goldTable("mart_run_sessions")} as sessions
      on segments.run_id = sessions.run_id
    where segments.run_id = ${sqlString(runId)}
      and segments.unit_system = ${sqlString(unitSystem)}
      and segments.segment_length_value = ${segmentLengthValue}
    order by segments.segment_index
    limit ${safeLimit}
  `);

  return rows.map(mapSegment);
}

async function queryRunSegmentsFromSupabase(
  runId: string,
  unitSystem: UnitSystem,
  segmentLengthValue: number,
  limit = 1200,
): Promise<RunSegment[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 5000);
  const pageSize = 1000;
  const rows: Record<string, unknown>[] = [];

  while (rows.length < safeLimit) {
    const result = await querySupabase("site_route_segments", {
      filters: [
        { column: "run_id", operator: "eq", value: runId },
        { column: "unit_system", operator: "eq", value: unitSystem },
        { column: "segment_length_value", operator: "eq", value: segmentLengthValue },
      ],
      order: [{ column: "segment_index", direction: "asc", nulls: "last" }],
      limit: Math.min(pageSize, safeLimit - rows.length),
      offset: rows.length,
    });

    rows.push(...result.rows);

    if (result.rows.length < pageSize) {
      break;
    }
  }

  return rows.map(mapSegment);
}

async function queryDaysFromDatabricks(limit = 371): Promise<DayRollup[]> {
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

async function queryDaysFromSupabase(limit = 371): Promise<DayRollup[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 1200);
  const result = await querySupabase("site_days", {
    order: [{ column: "calendar_date", direction: "desc", nulls: "last" }],
    limit: safeLimit,
  });

  return result.rows.map(mapDay).reverse();
}

async function queryWeeksRawFromDatabricks(limit = 104): Promise<WeekRollup[]> {
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

async function queryWeeksRawFromSupabase(limit = 104): Promise<WeekRollup[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 260);
  const result = await querySupabase("site_weeks", {
    order: [{ column: "week_start_date", direction: "desc", nulls: "last" }],
    limit: safeLimit,
  });

  return result.rows.map(mapWeek).reverse();
}

async function queryVolumeFromDatabricks(): Promise<VolumeData> {
  const [weeks, months, years] = await Promise.all([
    queryWeeksRawFromDatabricks(104),
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

async function queryVolumeFromSupabase(): Promise<VolumeData> {
  const [weeks, monthsResult, yearsResult] = await Promise.all([
    queryWeeksRawFromSupabase(104),
    querySupabase("site_months", {
      order: [{ column: "month_start_date", direction: "desc", nulls: "last" }],
      limit: 36,
    }),
    querySupabase("site_years", {
      order: [{ column: "year_start_date", direction: "desc", nulls: "last" }],
      limit: 10,
    }),
  ]);

  return {
    weeks,
    months: monthsResult.rows.map(mapMonth).reverse(),
    years: yearsResult.rows.map(mapYear).reverse(),
  };
}

async function queryFitnessFromDatabricks(limit = 150): Promise<FitnessPoint[]> {
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

async function queryFitnessFromSupabase(limit = 150): Promise<FitnessPoint[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const result = await querySupabase("site_fitness", {
    order: [
      { column: "activity_date", direction: "desc", nulls: "last" },
      { column: "activity_id", direction: "desc", nulls: "last" },
    ],
    limit: safeLimit,
  });

  return result.rows.map(mapFitness).reverse();
}

function queryLandingStatus(): Promise<LandingStatus> {
  return getSiteDataSource() === "databricks"
    ? queryLandingStatusFromDatabricks()
    : queryLandingStatusFromSupabase();
}

function queryDashboard(): Promise<DashboardSummary> {
  return getSiteDataSource() === "databricks"
    ? queryDashboardFromDatabricks()
    : queryDashboardFromSupabase();
}

function queryRuns(filters: RunFilters): Promise<PaginatedResult<RunSession>> {
  return getSiteDataSource() === "databricks"
    ? queryRunsFromDatabricks(filters)
    : queryRunsFromSupabase(filters);
}

function queryRoutes(limit?: number): Promise<RouteSummary[]> {
  return getSiteDataSource() === "databricks"
    ? queryRoutesFromDatabricks(limit)
    : queryRoutesFromSupabase(limit);
}

function queryRouteRecords(routeIds: readonly string[]): Promise<RouteGeometryRecord[]> {
  const requestedRouteIds = routeIdChunks(routeIds).flat();
  return getSiteDataSource() === "databricks"
    ? queryRouteRecordsFromDatabricks(requestedRouteIds)
    : queryRouteRecordsFromSupabase(requestedRouteIds);
}

function queryRunRecords(runId: string): Promise<ActivityRecord[]> {
  return getSiteDataSource() === "databricks"
    ? queryRunRecordsFromDatabricks(runId)
    : queryRunRecordsFromSupabase(runId);
}

function queryRunSegments(
  runId: string,
  unitSystem: UnitSystem,
  segmentLengthValue: number,
  limit?: number,
): Promise<RunSegment[]> {
  return getSiteDataSource() === "databricks"
    ? queryRunSegmentsFromDatabricks(runId, unitSystem, segmentLengthValue, limit)
    : queryRunSegmentsFromSupabase(runId, unitSystem, segmentLengthValue, limit);
}

function queryDays(limit?: number): Promise<DayRollup[]> {
  return getSiteDataSource() === "databricks"
    ? queryDaysFromDatabricks(limit)
    : queryDaysFromSupabase(limit);
}

function queryWeeksRaw(limit?: number): Promise<WeekRollup[]> {
  return getSiteDataSource() === "databricks"
    ? queryWeeksRawFromDatabricks(limit)
    : queryWeeksRawFromSupabase(limit);
}

function queryVolume(): Promise<VolumeData> {
  return getSiteDataSource() === "databricks"
    ? queryVolumeFromDatabricks()
    : queryVolumeFromSupabase();
}

function queryFitness(limit?: number): Promise<FitnessPoint[]> {
  return getSiteDataSource() === "databricks"
    ? queryFitnessFromDatabricks(limit)
    : queryFitnessFromSupabase(limit);
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

export function getRouteRecords(
  routeIds: readonly string[],
): Promise<DataResult<RouteGeometryRecord[]>> {
  return asResult(queryRouteRecords(routeIds));
}

export function getRunRecords(runId: string): Promise<DataResult<ActivityRecord[]>> {
  return asResult(queryRunRecords(runId));
}

export function getRunSegments(
  runId: string,
  unitSystem: UnitSystem,
  segmentLengthValue: number,
  limit?: number,
): Promise<DataResult<RunSegment[]>> {
  return asResult(queryRunSegments(runId, unitSystem, segmentLengthValue, limit));
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
