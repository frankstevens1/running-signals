export type RunSort =
  | "activity_date"
  | "distance_km"
  | "avg_pace_min_per_km"
  | "avg_heart_rate"
  | "total_ascent"
  | "prior_7d_distance_km"
  | "prior_28d_distance_km"
  | "route_id"
  | "record_distance_coverage_ratio";

export type SortDirection = "asc" | "desc";
export type RunView = "timeline" | "table";

export type RunFilters = {
  limit: number;
  offset: number;
  sort: RunSort;
  direction: SortDirection;
  dateFrom?: string;
  dateTo?: string;
  minDistanceKm?: number;
  maxDistanceKm?: number;
  minPace?: number;
  maxPace?: number;
  minAvgHr?: number;
  maxAvgHr?: number;
  routeId?: string;
  hasRecoveryHr?: boolean;
  minGpsCoverage?: number;
};

const RUN_SORTS = new Set<RunSort>([
  "activity_date",
  "distance_km",
  "avg_pace_min_per_km",
  "avg_heart_rate",
  "total_ascent",
  "prior_7d_distance_km",
  "prior_28d_distance_km",
  "route_id",
  "record_distance_coverage_ratio",
]);

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parsePositiveInt(
  value: string | null,
  fallback: number,
  max: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
}

export function parseOptionalNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseOptionalDate(value: string | null): string | undefined {
  if (!value || !DATE_PATTERN.test(value)) return undefined;
  return value;
}

export function parseOptionalBoolean(value: string | null): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export function parseRunFilters(params: URLSearchParams): RunFilters {
  const sort = params.get("sort");
  const direction = params.get("direction");

  return {
    limit: parsePositiveInt(params.get("limit"), 25, 100),
    offset: parsePositiveInt(params.get("offset"), 0, 10000),
    sort: sort && RUN_SORTS.has(sort as RunSort) ? (sort as RunSort) : "activity_date",
    direction: direction === "asc" ? "asc" : "desc",
    dateFrom: parseOptionalDate(params.get("dateFrom")),
    dateTo: parseOptionalDate(params.get("dateTo")),
    minDistanceKm: parseOptionalNumber(params.get("minDistanceKm")),
    maxDistanceKm: parseOptionalNumber(params.get("maxDistanceKm")),
    minPace: parseOptionalNumber(params.get("minPace")),
    maxPace: parseOptionalNumber(params.get("maxPace")),
    minAvgHr: parseOptionalNumber(params.get("minAvgHr")),
    maxAvgHr: parseOptionalNumber(params.get("maxAvgHr")),
    routeId: params.get("routeId") || undefined,
    hasRecoveryHr: parseOptionalBoolean(params.get("hasRecoveryHr")),
    minGpsCoverage: parseOptionalNumber(params.get("minGpsCoverage")),
  };
}

export function parseRunView(params: URLSearchParams): RunView {
  return params.get("view") === "table" ? "table" : "timeline";
}

export function getSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
): string | null {
  const value = searchParams[key];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function searchParamsFromRecord(
  searchParams: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }
  return params;
}
