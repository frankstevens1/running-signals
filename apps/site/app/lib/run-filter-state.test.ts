import { describe, expect, it } from "vitest";

import {
  clampRunFiltersToBounds,
  hasPersistedRunFilters,
  parseStoredRunFilters,
  runFilterFormValues,
  runFiltersFromFormValues,
  runFiltersFromSearchParams,
  serializeRunFilters,
  withRunFilters,
} from "./run-filter-state";
import { parseRunFilters } from "./query";
import type { RunFilterBounds } from "./types";

const bounds: RunFilterBounds = {
  minActivityDate: "2024-01-01",
  maxActivityDate: "2024-12-31",
  minDistanceKm: 2,
  maxDistanceKm: 20,
  minPaceMinPerKm: 4,
  maxPaceMinPerKm: 7,
  minAvgHeartRate: 120,
  maxAvgHeartRate: 180,
  minGpsCoverage: 0.5,
  maxGpsCoverage: 1,
};

describe("run filter state", () => {
  it("uses full-dataset bounds as display defaults without creating active filters", () => {
    const values = runFilterFormValues({}, bounds, "km");

    expect(values).toMatchObject({
      dateFrom: "2024-01-01",
      dateTo: "2024-12-31",
      minDistance: "2",
      maxDistance: "20",
      minPace: "4",
      maxPace: "7",
      minAvgHr: "120",
      maxAvgHr: "180",
      minGpsCoverage: "0.5",
    });
    expect(runFiltersFromFormValues(values, bounds, "km")).toEqual({});
  });

  it("persists canonical measurements and converts them for the selected display unit", () => {
    const filters = {
      minDistanceKm: 5,
      maxDistanceKm: 10,
      minPaceMinPerKm: 5,
      maxPaceMinPerKm: 6,
      routeId: "route-42",
    };
    const params = withRunFilters(new URLSearchParams({ view: "table", offset: "25" }), filters, "mi");
    const roundTripped = runFiltersFromSearchParams(params, "mi");

    expect(params.get("view")).toBe("table");
    expect(params.get("offset")).toBe("25");
    expect(roundTripped.minDistanceKm).toBeCloseTo(5, 3);
    expect(roundTripped.maxDistanceKm).toBeCloseTo(10, 3);
    expect(roundTripped.minPaceMinPerKm).toBeCloseTo(5, 3);
    expect(roundTripped.maxPaceMinPerKm).toBeCloseTo(6, 3);
    expect(roundTripped.routeId).toBe("route-42");
  });

  it("clamps persisted filters to the current bounds and removes full-range values", () => {
    const stored = serializeRunFilters({
      dateFrom: "2020-01-01",
      dateTo: "2030-01-01",
      minDistanceKm: 0,
      maxDistanceKm: 100,
      minAvgHr: 130,
      maxAvgHr: 250,
      minGpsCoverage: 0,
      routeId: "route-42",
      hasRecoveryHr: false,
    });

    expect(parseStoredRunFilters(stored, bounds)).toEqual({
      minAvgHr: 130,
      routeId: "route-42",
      hasRecoveryHr: false,
    });
  });

  it("removes stale full-range query filters before the run query is executed", () => {
    const filters = clampRunFiltersToBounds(
      parseRunFilters(
        new URLSearchParams({
          minDistance: "0",
          maxDistance: "100",
          minPace: "4",
          maxPace: "7",
        }),
      ),
      bounds,
    );

    expect(filters.minDistanceKm).toBeUndefined();
    expect(filters.maxDistanceKm).toBeUndefined();
    expect(filters.minPace).toBeUndefined();
    expect(filters.maxPace).toBeUndefined();
  });

  it("drops malformed, invalid, and inverted persisted values", () => {
    expect(parseStoredRunFilters("{", bounds)).toBeNull();
    expect(
      parseStoredRunFilters(JSON.stringify({ version: 2, filters: { routeId: "route-42" } }), bounds),
    ).toBeNull();

    const stored = JSON.stringify({
      version: 1,
      filters: {
        dateFrom: "2024-02-30",
        minDistanceKm: 15,
        maxDistanceKm: 5,
        minPaceMinPerKm: 6,
        maxPaceMinPerKm: 5,
        hasRecoveryHr: "false",
      },
    });

    expect(parseStoredRunFilters(stored, bounds)).toBeNull();
  });

  it("retains boolean false as an active persisted filter", () => {
    expect(hasPersistedRunFilters({ hasRecoveryHr: false })).toBe(true);
  });
});
