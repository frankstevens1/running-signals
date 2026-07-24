import {
  distanceToKm,
  paceToMinPerKm,
  type DistanceUnit,
} from "./distance-unit";

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
  minAltitudeRange?: number;
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
  if (value === null) return fallback;
  if (!/^[1-9]\d*$/.test(value)) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(parsed, max);
}

export function parseOffset(value: string | null, fallback = 0, max = 100_000): number {
  if (value === null) return fallback;
  if (!/^(0|[1-9]\d*)$/.test(value)) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(parsed, max);
}

export function isStrictPositiveInt(value: string | null, max: number): boolean {
  if (value === null) return true;
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= max;
}

export function isStrictOffset(value: string | null, max = 100_000): boolean {
  if (value === null) return true;
  return /^(0|[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= max;
}

export function parseOptionalNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseOptionalDate(value: string | null): string | undefined {
  if (!value || !DATE_PATTERN.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? value
    : undefined;
}

export function parseOptionalBoolean(value: string | null): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export function parseRunFilters(
  params: URLSearchParams,
  unit: DistanceUnit = "km",
): RunFilters {
  const sort = params.get("sort");
  const direction = params.get("direction");

  return {
    limit: parsePositiveInt(params.get("limit"), 25, 100),
    offset: parseOffset(params.get("offset"), 0, 100_000),
    sort: sort && RUN_SORTS.has(sort as RunSort) ? (sort as RunSort) : "activity_date",
    direction: direction === "asc" ? "asc" : "desc",
    dateFrom: parseOptionalDate(params.get("dateFrom")),
    dateTo: parseOptionalDate(params.get("dateTo")),
    minDistanceKm: parseOptionalMeasurement(
      params.get("minDistance"),
      (value) => distanceToKm(value, unit),
      params.get("minDistanceKm"),
    ),
    maxDistanceKm: parseOptionalMeasurement(
      params.get("maxDistance"),
      (value) => distanceToKm(value, unit),
      params.get("maxDistanceKm"),
    ),
    minPace: parseOptionalMeasurement(params.get("minPace"), (value) =>
      paceToMinPerKm(value, unit),
    ),
    maxPace: parseOptionalMeasurement(params.get("maxPace"), (value) =>
      paceToMinPerKm(value, unit),
    ),
    minAvgHr: parseOptionalNumber(params.get("minAvgHr")),
    maxAvgHr: parseOptionalNumber(params.get("maxAvgHr")),
    routeId: params.get("routeId") || undefined,
    hasRecoveryHr: parseOptionalBoolean(params.get("hasRecoveryHr")),
    minGpsCoverage: parseOptionalNumber(params.get("minGpsCoverage")),
    minAltitudeRange: parseOptionalNumber(params.get("minAltitudeRange")),
  };
}

function parseOptionalMeasurement(
  value: string | null,
  toCanonical: (value: number) => number,
  canonicalFallback: string | null = null,
): number | undefined {
  const parsed = parseOptionalNumber(value);
  if (parsed !== undefined) return toCanonical(parsed);
  return parseOptionalNumber(canonicalFallback);
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
