import type { DayRollup } from "./types";

export type CurrentWeekToDate = {
  weekStartDate: string;
  latestCompletedDate: string | null;
  runCount: number;
  distanceKm: number;
  activeDays: number;
};

function dateFromIso(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function weekStartDate(asOfDate: string): string {
  const date = dateFromIso(asOfDate);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return isoDate(date);
}

export function currentWeekToDate(
  days: DayRollup[],
  asOfDate: string,
): CurrentWeekToDate {
  const currentWeekStartDate = weekStartDate(asOfDate);
  const currentWeekDays = days.filter(
    (day) => day.calendarDate >= currentWeekStartDate && day.calendarDate <= asOfDate,
  );

  return {
    weekStartDate: currentWeekStartDate,
    latestCompletedDate: currentWeekDays.at(-1)?.calendarDate ?? null,
    runCount: currentWeekDays.reduce((total, day) => total + day.runCount, 0),
    distanceKm: currentWeekDays.reduce((total, day) => total + day.distanceKm, 0),
    activeDays: currentWeekDays.filter((day) => day.activeDayFlag).length,
  };
}
