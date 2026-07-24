import type { DayRollup, MonthRollup, YearRollup } from "./types";

export function monthsFromDays(days: DayRollup[]): MonthRollup[] {
  const groups = new Map<string, DayRollup[]>();
  for (const day of days) {
    const key = `${day.calendarDate.slice(0, 7)}-01`;
    groups.set(key, [...(groups.get(key) ?? []), day]);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(
    ([key, values]) => ({
      monthStartDate: key,
      calendarYear: Number(key.slice(0, 4)),
      calendarMonth: Number(key.slice(5, 7)),
      runsPerMonth: values.reduce((total, day) => total + day.runCount, 0),
      monthlyDistanceKm: values.reduce((total, day) => total + day.distanceKm, 0),
      monthlyDurationSeconds: values.reduce((total, day) => total + day.durationSeconds, 0),
      longRunDistanceKm: Math.max(...values.map((day) => day.longRunDistanceKm), 0),
      activeDays: values.filter((day) => day.activeDayFlag).length,
    }),
  );
}

export function yearsFromDays(days: DayRollup[]): YearRollup[] {
  const groups = new Map<string, DayRollup[]>();
  for (const day of days) {
    const key = `${day.calendarDate.slice(0, 4)}-01-01`;
    groups.set(key, [...(groups.get(key) ?? []), day]);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(
    ([key, values]) => ({
      yearStartDate: key,
      calendarYear: Number(key.slice(0, 4)),
      runsPerYear: values.reduce((total, day) => total + day.runCount, 0),
      yearlyDistanceKm: values.reduce((total, day) => total + day.distanceKm, 0),
      yearlyDurationSeconds: values.reduce((total, day) => total + day.durationSeconds, 0),
      longRunDistanceKm: Math.max(...values.map((day) => day.longRunDistanceKm), 0),
      activeDays: values.filter((day) => day.activeDayFlag).length,
    }),
  );
}
