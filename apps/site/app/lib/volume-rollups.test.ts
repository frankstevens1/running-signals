import { describe, expect, it } from "vitest";

import type { DayRollup } from "./types";
import { monthsFromDays, yearsFromDays } from "./volume-rollups";

function day(calendarDate: string, runCount: number, distanceKm: number): DayRollup {
  return {
    calendarDate,
    runCount,
    distanceKm,
    durationSeconds: distanceKm * 300,
    longRunDistanceKm: distanceKm,
    activeDayFlag: runCount > 0,
    rolling7dDistanceKm: null,
    rolling28dDistanceKm: null,
  };
}

describe("day-derived volume buckets", () => {
  const days = [
    day("2025-12-31", 1, 5),
    day("2026-01-01", 0, 0),
    day("2026-01-05", 2, 12),
  ];

  it("derives month and year buckets only from included day rows", () => {
    expect(monthsFromDays(days).map((month) => [month.monthStartDate, month.monthlyDistanceKm]))
      .toEqual([["2025-12-01", 5], ["2026-01-01", 12]]);
    expect(yearsFromDays(days).map((year) => [year.calendarYear, year.yearlyDistanceKm]))
      .toEqual([[2025, 5], [2026, 12]]);
  });
});
