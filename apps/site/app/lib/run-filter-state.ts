import {
  distanceFromKm,
  distanceToKm,
  paceFromMinPerKm,
  paceToMinPerKm,
  type DistanceUnit,
} from "./distance-unit";
import { parseRunFilters, type RunFilters } from "./query";
import type { RunFilterBounds } from "./types";

export const RUN_FILTER_STORAGE_KEY = "running-signals-run-filters";

export const EMPTY_RUN_FILTER_BOUNDS: RunFilterBounds = {
  minActivityDate: null,
  maxActivityDate: null,
  minDistanceKm: null,
  maxDistanceKm: null,
  minPaceMinPerKm: null,
  maxPaceMinPerKm: null,
  minAvgHeartRate: null,
  maxAvgHeartRate: null,
  minGpsCoverage: null,
  maxGpsCoverage: null,
  minAltitudeRangeM: null,
  maxAltitudeRangeM: null,
};

const RUN_FILTER_STORAGE_VERSION = 1;
const DEFAULT_VALUE_EPSILON = 0.0001;

const runFilterQueryKeys = [
  "dateFrom",
  "dateTo",
  "minDistance",
  "maxDistance",
  "minDistanceKm",
  "maxDistanceKm",
  "minPace",
  "maxPace",
  "minAvgHr",
  "maxAvgHr",
  "routeId",
  "hasRecoveryHr",
  "minGpsCoverage",
  "minAltitudeRange",
] as const;

export type PersistedRunFilters = {
  dateFrom?: string;
  dateTo?: string;
  minDistanceKm?: number;
  maxDistanceKm?: number;
  minPaceMinPerKm?: number;
  maxPaceMinPerKm?: number;
  minAvgHr?: number;
  maxAvgHr?: number;
  routeId?: string;
  hasRecoveryHr?: boolean;
  minGpsCoverage?: number;
  minAltitudeRange?: number;
};

export type RunFilterFormValues = {
  dateFrom: string;
  dateTo: string;
  minDistance: string;
  maxDistance: string;
  minPace: string;
  maxPace: string;
  minAvgHr: string;
  maxAvgHr: string;
  routeId: string;
  hasRecoveryHr: "" | "true" | "false";
  minAltitudeRange: string;
};

type StoredRunFilters = {
  version: number;
  filters: Record<string, unknown>;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function optionalStoredNumber(value: unknown): number | undefined {
  return isFiniteNumber(value) ? value : undefined;
}

function optionalStoredDate(value: unknown): string | undefined {
  return isIsoDate(value) ? value : undefined;
}

function optionalStoredRouteId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const routeId = value.trim();
  return routeId || undefined;
}

function optionalInputNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function clampNumber(
  value: number | undefined,
  minimum: number | null,
  maximum: number | null,
): number | undefined {
  if (
    value === undefined ||
    minimum === null ||
    maximum === null ||
    !Number.isFinite(minimum) ||
    !Number.isFinite(maximum) ||
    minimum > maximum
  ) {
    return undefined;
  }

  return Math.min(Math.max(value, minimum), maximum);
}

function clampDate(
  value: string | undefined,
  minimum: string | null,
  maximum: string | null,
): string | undefined {
  if (
    value === undefined ||
    minimum === null ||
    maximum === null ||
    !isIsoDate(value) ||
    !isIsoDate(minimum) ||
    !isIsoDate(maximum) ||
    minimum > maximum
  ) {
    return undefined;
  }

  if (value < minimum) return minimum;
  if (value > maximum) return maximum;
  return value;
}

function normalizePair(
  minimum: number | undefined,
  maximum: number | undefined,
): [number | undefined, number | undefined] {
  if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
    return [undefined, undefined];
  }

  return [minimum, maximum];
}

function normalizeDatePair(
  minimum: string | undefined,
  maximum: string | undefined,
): [string | undefined, string | undefined] {
  if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
    return [undefined, undefined];
  }

  return [minimum, maximum];
}

function validateUnboundedRunFilters(filters: PersistedRunFilters): PersistedRunFilters {
  const [dateFrom, dateTo] = normalizeDatePair(
    optionalStoredDate(filters.dateFrom),
    optionalStoredDate(filters.dateTo),
  );
  const [minDistanceKm, maxDistanceKm] = normalizePair(
    optionalStoredNumber(filters.minDistanceKm),
    optionalStoredNumber(filters.maxDistanceKm),
  );
  const [minPaceMinPerKm, maxPaceMinPerKm] = normalizePair(
    optionalStoredNumber(filters.minPaceMinPerKm),
    optionalStoredNumber(filters.maxPaceMinPerKm),
  );
  const [minAvgHr, maxAvgHr] = normalizePair(
    optionalStoredNumber(filters.minAvgHr),
    optionalStoredNumber(filters.maxAvgHr),
  );

  return {
    dateFrom,
    dateTo,
    minDistanceKm,
    maxDistanceKm,
    minPaceMinPerKm,
    maxPaceMinPerKm,
    minAvgHr,
    maxAvgHr,
    routeId: optionalStoredRouteId(filters.routeId),
    hasRecoveryHr:
      typeof filters.hasRecoveryHr === "boolean" ? filters.hasRecoveryHr : undefined,
    minGpsCoverage: optionalStoredNumber(filters.minGpsCoverage),
    minAltitudeRange: optionalStoredNumber(filters.minAltitudeRange),
  };
}

function isAtBound(value: number | undefined, bound: number | null): boolean {
  return (
    value !== undefined &&
    bound !== null &&
    Math.abs(value - bound) <= DEFAULT_VALUE_EPSILON
  );
}

function withoutDefaultRangeValues(
  filters: PersistedRunFilters,
  bounds: RunFilterBounds,
): PersistedRunFilters {
  return {
    ...filters,
    dateFrom: filters.dateFrom === bounds.minActivityDate ? undefined : filters.dateFrom,
    dateTo: filters.dateTo === bounds.maxActivityDate ? undefined : filters.dateTo,
    minDistanceKm: isAtBound(filters.minDistanceKm, bounds.minDistanceKm)
      ? undefined
      : filters.minDistanceKm,
    maxDistanceKm: isAtBound(filters.maxDistanceKm, bounds.maxDistanceKm)
      ? undefined
      : filters.maxDistanceKm,
    minPaceMinPerKm: isAtBound(filters.minPaceMinPerKm, bounds.minPaceMinPerKm)
      ? undefined
      : filters.minPaceMinPerKm,
    maxPaceMinPerKm: isAtBound(filters.maxPaceMinPerKm, bounds.maxPaceMinPerKm)
      ? undefined
      : filters.maxPaceMinPerKm,
    minAvgHr: isAtBound(filters.minAvgHr, bounds.minAvgHeartRate)
      ? undefined
      : filters.minAvgHr,
    maxAvgHr: isAtBound(filters.maxAvgHr, bounds.maxAvgHeartRate)
      ? undefined
      : filters.maxAvgHr,
    minGpsCoverage: isAtBound(filters.minGpsCoverage, bounds.minGpsCoverage)
      ? undefined
      : filters.minGpsCoverage,
    minAltitudeRange: isAtBound(filters.minAltitudeRange, bounds.minAltitudeRangeM)
      ? undefined
      : filters.minAltitudeRange,
  };
}

export function normalizeRunFilters(
  filters: PersistedRunFilters,
  bounds: RunFilterBounds,
): PersistedRunFilters {
  const [dateFrom, dateTo] = normalizeDatePair(
    clampDate(filters.dateFrom, bounds.minActivityDate, bounds.maxActivityDate),
    clampDate(filters.dateTo, bounds.minActivityDate, bounds.maxActivityDate),
  );
  const [minDistanceKm, maxDistanceKm] = normalizePair(
    clampNumber(filters.minDistanceKm, bounds.minDistanceKm, bounds.maxDistanceKm),
    clampNumber(filters.maxDistanceKm, bounds.minDistanceKm, bounds.maxDistanceKm),
  );
  const [minPaceMinPerKm, maxPaceMinPerKm] = normalizePair(
    clampNumber(
      filters.minPaceMinPerKm,
      bounds.minPaceMinPerKm,
      bounds.maxPaceMinPerKm,
    ),
    clampNumber(
      filters.maxPaceMinPerKm,
      bounds.minPaceMinPerKm,
      bounds.maxPaceMinPerKm,
    ),
  );
  const [minAvgHr, maxAvgHr] = normalizePair(
    clampNumber(filters.minAvgHr, bounds.minAvgHeartRate, bounds.maxAvgHeartRate),
    clampNumber(filters.maxAvgHr, bounds.minAvgHeartRate, bounds.maxAvgHeartRate),
  );

  return withoutDefaultRangeValues(
    {
      dateFrom,
      dateTo,
      minDistanceKm,
      maxDistanceKm,
      minPaceMinPerKm,
      maxPaceMinPerKm,
      minAvgHr,
      maxAvgHr,
      routeId: optionalStoredRouteId(filters.routeId),
      hasRecoveryHr:
        typeof filters.hasRecoveryHr === "boolean" ? filters.hasRecoveryHr : undefined,
      minGpsCoverage: clampNumber(
        filters.minGpsCoverage,
        bounds.minGpsCoverage,
        bounds.maxGpsCoverage,
      ),
      minAltitudeRange: clampNumber(
        filters.minAltitudeRange,
        bounds.minAltitudeRangeM,
        bounds.maxAltitudeRangeM,
      ),
    },
    bounds,
  );
}

export function hasPersistedRunFilters(filters: PersistedRunFilters): boolean {
  return Object.values(filters).some((value) => value !== undefined);
}

export function runFiltersEqual(
  left: PersistedRunFilters,
  right: PersistedRunFilters,
): boolean {
  return (
    left.dateFrom === right.dateFrom &&
    left.dateTo === right.dateTo &&
    left.minDistanceKm === right.minDistanceKm &&
    left.maxDistanceKm === right.maxDistanceKm &&
    left.minPaceMinPerKm === right.minPaceMinPerKm &&
    left.maxPaceMinPerKm === right.maxPaceMinPerKm &&
    left.minAvgHr === right.minAvgHr &&
    left.maxAvgHr === right.maxAvgHr &&
    left.routeId === right.routeId &&
    left.hasRecoveryHr === right.hasRecoveryHr &&
    left.minGpsCoverage === right.minGpsCoverage &&
    left.minAltitudeRange === right.minAltitudeRange
  );
}

export function parseStoredRunFilters(
  rawValue: string | null,
  bounds: RunFilterBounds,
): PersistedRunFilters | null {
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      (parsed as Partial<StoredRunFilters>).version !== RUN_FILTER_STORAGE_VERSION ||
      !(parsed as Partial<StoredRunFilters>).filters ||
      typeof (parsed as Partial<StoredRunFilters>).filters !== "object" ||
      Array.isArray((parsed as Partial<StoredRunFilters>).filters)
    ) {
      return null;
    }

    const filters = (parsed as StoredRunFilters).filters;
    const normalized = normalizeRunFilters(
      {
        dateFrom: optionalStoredDate(filters.dateFrom),
        dateTo: optionalStoredDate(filters.dateTo),
        minDistanceKm: optionalStoredNumber(filters.minDistanceKm),
        maxDistanceKm: optionalStoredNumber(filters.maxDistanceKm),
        minPaceMinPerKm: optionalStoredNumber(filters.minPaceMinPerKm),
        maxPaceMinPerKm: optionalStoredNumber(filters.maxPaceMinPerKm),
        minAvgHr: optionalStoredNumber(filters.minAvgHr),
        maxAvgHr: optionalStoredNumber(filters.maxAvgHr),
        routeId: optionalStoredRouteId(filters.routeId),
        hasRecoveryHr:
          typeof filters.hasRecoveryHr === "boolean" ? filters.hasRecoveryHr : undefined,
        minGpsCoverage: optionalStoredNumber(filters.minGpsCoverage),
        minAltitudeRange: optionalStoredNumber(filters.minAltitudeRange),
      },
      bounds,
    );

    return hasPersistedRunFilters(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

export function serializeRunFilters(filters: PersistedRunFilters): string {
  return JSON.stringify({ version: RUN_FILTER_STORAGE_VERSION, filters });
}

function persistedFiltersFromRunFilters(filters: RunFilters): PersistedRunFilters {
  return {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    minDistanceKm: filters.minDistanceKm,
    maxDistanceKm: filters.maxDistanceKm,
    minPaceMinPerKm: filters.minPace,
    maxPaceMinPerKm: filters.maxPace,
    minAvgHr: filters.minAvgHr,
    maxAvgHr: filters.maxAvgHr,
    routeId: filters.routeId,
    hasRecoveryHr: filters.hasRecoveryHr,
    minGpsCoverage: filters.minGpsCoverage,
    minAltitudeRange: filters.minAltitudeRange,
  };
}

export function clampRunFiltersToBounds(
  filters: RunFilters,
  bounds: RunFilterBounds,
): RunFilters {
  const normalized = normalizeRunFilters(persistedFiltersFromRunFilters(filters), bounds);

  return {
    ...filters,
    dateFrom: normalized.dateFrom,
    dateTo: normalized.dateTo,
    minDistanceKm: normalized.minDistanceKm,
    maxDistanceKm: normalized.maxDistanceKm,
    minPace: normalized.minPaceMinPerKm,
    maxPace: normalized.maxPaceMinPerKm,
    minAvgHr: normalized.minAvgHr,
    maxAvgHr: normalized.maxAvgHr,
    routeId: normalized.routeId,
    hasRecoveryHr: normalized.hasRecoveryHr,
    minGpsCoverage: normalized.minGpsCoverage,
    minAltitudeRange: normalized.minAltitudeRange,
  };
}

export function runFiltersFromSearchParams(
  params: URLSearchParams,
  unit: DistanceUnit,
): PersistedRunFilters {
  return persistedFiltersFromRunFilters(parseRunFilters(params, unit));
}

export function hasActiveRunFilterParams(params: URLSearchParams): boolean {
  return runFilterQueryKeys.some((key) => {
    const value = params.get(key);
    return value !== null && value !== "";
  });
}

export function formatRunFilterNumber(
  value: number | null | undefined,
  precision = 2,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";

  const rounded = Number(value.toFixed(precision));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function paceMinutesToTimeString(minutes: number): string {
  if (!Number.isFinite(minutes)) return "";
  const mins = Math.floor(minutes);
  const secs = Math.round((minutes - mins) * 60);
  if (secs >= 60) return `${mins + 1}:00`;
  return `${mins}:${String(secs % 60).padStart(2, "0")}`;
}

function parsePaceTimeString(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const match = value.trim().match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return undefined;
  const mins = Number(match[1]);
  const secs = match[2] !== undefined ? Number(match[2]) : 0;
  if (secs >= 60) return undefined;
  if (!Number.isFinite(mins) || !Number.isFinite(secs)) return undefined;
  return mins + secs / 60;
}

function formatConvertedBound(
  value: number | null,
  convert: (value: number) => number,
  precision?: number,
): string {
  return value === null ? "" : formatRunFilterNumber(convert(value), precision);
}

export function runFilterFormValues(
  filters: PersistedRunFilters,
  bounds: RunFilterBounds,
  unit: DistanceUnit,
): RunFilterFormValues {
  return {
    dateFrom: filters.dateFrom ?? bounds.minActivityDate ?? "",
    dateTo: filters.dateTo ?? bounds.maxActivityDate ?? "",
    minDistance:
      filters.minDistanceKm === undefined
        ? formatConvertedBound(bounds.minDistanceKm, (value) => distanceFromKm(value, unit))
        : formatRunFilterNumber(distanceFromKm(filters.minDistanceKm, unit)),
    maxDistance:
      filters.maxDistanceKm === undefined
        ? formatConvertedBound(bounds.maxDistanceKm, (value) => distanceFromKm(value, unit))
        : formatRunFilterNumber(distanceFromKm(filters.maxDistanceKm, unit)),
    minPace:
      filters.minPaceMinPerKm === undefined
        ? (bounds.minPaceMinPerKm === null ? "" : paceMinutesToTimeString(paceFromMinPerKm(bounds.minPaceMinPerKm, unit)))
        : paceMinutesToTimeString(paceFromMinPerKm(filters.minPaceMinPerKm, unit)),
    maxPace:
      filters.maxPaceMinPerKm === undefined
        ? (bounds.maxPaceMinPerKm === null ? "" : paceMinutesToTimeString(paceFromMinPerKm(bounds.maxPaceMinPerKm, unit)))
        : paceMinutesToTimeString(paceFromMinPerKm(filters.maxPaceMinPerKm, unit)),
    minAvgHr:
      filters.minAvgHr === undefined
        ? formatRunFilterNumber(bounds.minAvgHeartRate)
        : formatRunFilterNumber(filters.minAvgHr),
    maxAvgHr:
      filters.maxAvgHr === undefined
        ? formatRunFilterNumber(bounds.maxAvgHeartRate)
        : formatRunFilterNumber(filters.maxAvgHr),
    routeId: filters.routeId ?? "",
    hasRecoveryHr:
      filters.hasRecoveryHr === true ? "true" : filters.hasRecoveryHr === false ? "false" : "",
    minAltitudeRange:
      filters.minAltitudeRange === undefined
        ? formatRunFilterNumber(bounds.minAltitudeRangeM, 0)
        : formatRunFilterNumber(filters.minAltitudeRange, 0),
  };
}

export function runFiltersFromFormValues(
  values: RunFilterFormValues,
  bounds: RunFilterBounds | null,
  unit: DistanceUnit,
): PersistedRunFilters {
  const minDistance = optionalInputNumber(values.minDistance);
  const maxDistance = optionalInputNumber(values.maxDistance);
  const minPace = parsePaceTimeString(values.minPace);
  const maxPace = parsePaceTimeString(values.maxPace);

  const filters = {
    dateFrom: values.dateFrom || undefined,
    dateTo: values.dateTo || undefined,
    minDistanceKm: minDistance === undefined ? undefined : distanceToKm(minDistance, unit),
    maxDistanceKm: maxDistance === undefined ? undefined : distanceToKm(maxDistance, unit),
    minPaceMinPerKm: minPace === undefined ? undefined : paceToMinPerKm(minPace, unit),
    maxPaceMinPerKm: maxPace === undefined ? undefined : paceToMinPerKm(maxPace, unit),
    minAvgHr: optionalInputNumber(values.minAvgHr),
    maxAvgHr: optionalInputNumber(values.maxAvgHr),
    routeId: values.routeId,
    hasRecoveryHr:
      values.hasRecoveryHr === "true"
        ? true
        : values.hasRecoveryHr === "false"
          ? false
          : undefined,
    minAltitudeRange: optionalInputNumber(values.minAltitudeRange),
  };

  return bounds ? normalizeRunFilters(filters, bounds) : validateUnboundedRunFilters(filters);
}

export function withRunFilters(
  params: URLSearchParams,
  filters: PersistedRunFilters,
  unit: DistanceUnit,
): URLSearchParams {
  const next = new URLSearchParams(params);

  for (const key of runFilterQueryKeys) {
    next.delete(key);
  }

  if (filters.dateFrom) next.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) next.set("dateTo", filters.dateTo);
  if (filters.minDistanceKm !== undefined) {
    next.set("minDistance", formatRunFilterNumber(distanceFromKm(filters.minDistanceKm, unit)));
  }
  if (filters.maxDistanceKm !== undefined) {
    next.set("maxDistance", formatRunFilterNumber(distanceFromKm(filters.maxDistanceKm, unit)));
  }
  if (filters.minPaceMinPerKm !== undefined) {
    next.set("minPace", formatRunFilterNumber(paceFromMinPerKm(filters.minPaceMinPerKm, unit)));
  }
  if (filters.maxPaceMinPerKm !== undefined) {
    next.set("maxPace", formatRunFilterNumber(paceFromMinPerKm(filters.maxPaceMinPerKm, unit)));
  }
  if (filters.minAvgHr !== undefined) next.set("minAvgHr", formatRunFilterNumber(filters.minAvgHr));
  if (filters.maxAvgHr !== undefined) next.set("maxAvgHr", formatRunFilterNumber(filters.maxAvgHr));
  if (filters.routeId) next.set("routeId", filters.routeId);
  if (filters.hasRecoveryHr !== undefined) {
    next.set("hasRecoveryHr", String(filters.hasRecoveryHr));
  }
  if (filters.minGpsCoverage !== undefined) {
    next.set("minGpsCoverage", formatRunFilterNumber(filters.minGpsCoverage));
  }
  if (filters.minAltitudeRange !== undefined) {
    next.set("minAltitudeRange", formatRunFilterNumber(filters.minAltitudeRange, 0));
  }

  return next;
}
