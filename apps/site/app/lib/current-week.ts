import type { DayRollup } from "./types";

export type CurrentWeekToDate = {
  weekStartDate: string;
  latestCompletedDate: string | null;
  includesLiveToday: boolean;
  runCount: number;
  distanceKm: number;
  activeDays: number;
  daysSoFar: number;
};

function dateFromIso(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function weekStartDate(asOfDate: string): string {
  const date = dateFromIso(asOfDate);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return isoDate(date);
}

export function daysInWeekToDate(asOfDate: string): number {
  const asOf = dateFromIso(asOfDate);
  const weekStart = dateFromIso(weekStartDate(asOfDate));
  return Math.floor((asOf.getTime() - weekStart.getTime()) / 86_400_000) + 1;
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
    includesLiveToday: false,
    runCount: currentWeekDays.reduce((total, day) => total + day.runCount, 0),
    distanceKm: currentWeekDays.reduce((total, day) => total + day.distanceKm, 0),
    activeDays: currentWeekDays.filter((day) => day.activeDayFlag).length,
    daysSoFar: daysInWeekToDate(asOfDate),
  };
}
