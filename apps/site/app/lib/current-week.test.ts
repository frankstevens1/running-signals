import { describe, expect, it } from "vitest";

import { currentWeekToDate, weekStreakRecordStatus } from "./current-week";
import type { DayRollup } from "./types";

const days: DayRollup[] = [
  {
    calendarDate: "2026-07-19",
    runCount: 1,
    distanceKm: 8,
    durationSeconds: 2400,
    longRunDistanceKm: 8,
    activeDayFlag: true,
    rolling7dDistanceKm: null,
    rolling28dDistanceKm: null,
  },
  {
    calendarDate: "2026-07-20",
    runCount: 1,
    distanceKm: 5.5,
    durationSeconds: 1800,
    longRunDistanceKm: 5.5,
    activeDayFlag: true,
    rolling7dDistanceKm: null,
    rolling28dDistanceKm: null,
  },
  {
    calendarDate: "2026-07-21",
    runCount: 0,
    distanceKm: 0,
    durationSeconds: 0,
    longRunDistanceKm: 0,
    activeDayFlag: false,
    rolling7dDistanceKm: null,
    rolling28dDistanceKm: null,
  },
];

describe("currentWeekToDate", () => {
  it("uses the current calendar week instead of relabeling the previous completed week", () => {
    expect(currentWeekToDate(days, "2026-07-21")).toEqual({
      weekStartDate: "2026-07-20",
      latestCompletedDate: "2026-07-21",
      includesLiveToday: false,
      runCount: 1,
      distanceKm: 5.5,
      activeDays: 1,
      daysSoFar: 2,
    });
  });

  it("returns an empty week-to-date summary before its first completed day is published", () => {
    expect(currentWeekToDate(days.filter((day) => day.calendarDate < "2026-07-20"), "2026-07-20"))
      .toEqual({
        weekStartDate: "2026-07-20",
        latestCompletedDate: null,
        includesLiveToday: false,
        runCount: 0,
        distanceKm: 0,
        activeDays: 0,
        daysSoFar: 1,
      });
  });
});

describe("weekStreakRecordStatus", () => {
  it("identifies a new record instead of reporting a negative shortfall", () => {
    expect(weekStreakRecordStatus(18, 17)).toEqual({
      kind: "new-record",
      previousRecord: 17,
    });
  });

  it("identifies a tied record", () => {
    expect(weekStreakRecordStatus(17, 17)).toEqual({
      kind: "current-record",
      record: 17,
    });
  });

  it("reports only positive shortfalls", () => {
    expect(weekStreakRecordStatus(16, 17)).toEqual({
      kind: "short",
      record: 17,
      weeksShort: 1,
    });
  });
});
