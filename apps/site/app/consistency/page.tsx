import { Activity, CalendarDays, CalendarX, Flame } from "lucide-react";

import { ActivityCalendar } from "@/app/components/activity-calendar";
import { AppShell } from "@/app/components/app-shell";
import { DataState } from "@/app/components/data-state";
import { MetricCard } from "@/app/components/metric-card";
import { ScrollReveal } from "@/app/components/motion-reveal";
import { SectionHeading } from "@/app/components/section-heading";
import { getCurrentWeekAligned, getDays, getWeeks, getWeekStreakRecord } from "@/app/lib/data";
import { formatDate, formatDecimal2, formatDistance, formatInteger } from "@/app/lib/format";
import { explorerPages } from "@/app/lib/page-metadata";
import { getServerDistanceUnit } from "@/app/lib/server-distance-unit";
import type { DayRollup, WeekRollup } from "@/app/lib/types";

type DailyConsistencyContext = {
  longestDailyRunStreak: number;
  averageDailyRunStreak: number | null;
  longestTrainingBreak: number;
  averageBreakLength: number | null;
};

function getDailyConsistencyContext(days: DayRollup[]): DailyConsistencyContext {
  let currentIsRunDay: boolean | null = null;
  let currentLength = 0;
  let longestDailyRunStreak = 0;
  let longestTrainingBreak = 0;
  let dailyRunStreakTotal = 0;
  let dailyRunStreakCount = 0;
  let breakTotal = 0;
  let breakCount = 0;

  function closeCurrentRun(): void {
    if (currentIsRunDay === null || currentLength === 0) return;

    if (currentIsRunDay) {
      longestDailyRunStreak = Math.max(longestDailyRunStreak, currentLength);
      dailyRunStreakTotal += currentLength;
      dailyRunStreakCount += 1;
      return;
    }

    longestTrainingBreak = Math.max(longestTrainingBreak, currentLength);
    breakTotal += currentLength;
    breakCount += 1;
  }

  for (const day of days) {
    const isRunDay = day.activeDayFlag === true;

    if (currentIsRunDay === null || currentIsRunDay === isRunDay) {
      currentIsRunDay = isRunDay;
      currentLength += 1;
      continue;
    }

    closeCurrentRun();
    currentIsRunDay = isRunDay;
    currentLength = 1;
  }

  closeCurrentRun();

  return {
    longestDailyRunStreak,
    averageDailyRunStreak:
      dailyRunStreakCount > 0 ? dailyRunStreakTotal / dailyRunStreakCount : null,
    longestTrainingBreak,
    averageBreakLength: breakCount > 0 ? breakTotal / breakCount : null,
  };
}

function trendDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
): { direction: "up" | "down" | "neutral"; diff: number } | null {
  if (current == null || previous == null) return null;
  const diff = current - previous;
  const direction =
    diff > 0 ? ("up" as const) : diff < 0 ? ("down" as const) : ("neutral" as const);
  return { direction, diff };
}

function streakStartDate(week: WeekRollup | undefined): string | null {
  const streakLength = week?.activeWeekStreak ?? 0;
  if (!week || streakLength < 1) return null;

  const start = new Date(`${week.weekStartDate}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (streakLength - 1) * 7);
  return start.toISOString().slice(0, 10);
}

export default async function ConsistencyPage() {
  const [days, weeks, currentWeekAligned, weekStreakRecord, unit] = await Promise.all([
    getDays(371),
    getWeeks(52),
    getCurrentWeekAligned(),
    getWeekStreakRecord(),
    getServerDistanceUnit(),
  ]);

  let priorDailyContext: DailyConsistencyContext | null = null;
  let recentDailyContext: DailyConsistencyContext | null = null;
  let dailyContext: DailyConsistencyContext | null = null;
  if (days.status === "ok") {
    dailyContext = getDailyConsistencyContext(days.data);
    const midpoint = Math.floor(days.data.length / 2);
    priorDailyContext = getDailyConsistencyContext(days.data.slice(0, midpoint));
    recentDailyContext = getDailyConsistencyContext(days.data.slice(midpoint));
  }
  const currentWeek =
    currentWeekAligned.status === "ok" ? currentWeekAligned.data : null;
  const longestActiveWeekStreak =
    weekStreakRecord.status === "ok" ? weekStreakRecord.data.longestActiveWeekStreak : 0;

  return (
    <AppShell>
      <div className="space-y-10">
        <SectionHeading
          eyebrow="mart_days, int_current_week_aligned, and mart_weeks"
          title="Consistency signals"
          description="Daily rollups update through the latest completed day; the current week includes any available partial-day data."
          icon={explorerPages.consistency.icon}
        />
        <DataState result={days}>
          {(data) => (
            <ScrollReveal>
              <ActivityCalendar days={data} unit={unit} />
            </ScrollReveal>
          )}
        </DataState>
        <DataState result={weeks}>
          {(data) => {
            const latest = data.at(-1);
            const penultimate = data.at(-2);
            const activeWeeks = data.filter((week) => week.activeWeekFlag).length;
            const activeWeekPct =
              data.length > 0 ? Math.round((activeWeeks / data.length) * 100) : null;
            const latestStreak = latest?.activeWeekStreak ?? 0;
            const latestStreakStartDate = streakStartDate(latest);

            const currentWeekPct =
              currentWeek?.distanceKm &&
              latest?.weeklyDistanceKm &&
              latest.weeklyDistanceKm > 0
                ? Math.round(
                    (currentWeek.distanceKm / latest.weeklyDistanceKm) * 100,
                  )
                : null;

            const weeklyDistanceTrend = trendDelta(
              latest?.weeklyDistanceKm,
              penultimate?.weeklyDistanceKm,
            );

            return (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Active weeks in view"
                  value={formatInteger(activeWeeks)}
                  detail={`${formatInteger(data.length)} completed weeks in view; ${formatInteger(activeWeeks)} included at least one run`}
                  icon={CalendarDays}
                  trend={
                    activeWeekPct !== null
                      ? {
                          direction: "neutral",
                          value: `${activeWeekPct}%`,
                          label: "of weeks in view",
                        }
                      : undefined
                  }
                />
                <MetricCard
                  label="Current week to date"
                  value={formatDistance(currentWeek?.distanceKm, unit)}
                  detail={
                    currentWeek
                      ? `${formatInteger(currentWeek.runCount)} runs across ${formatInteger(currentWeek.daysSoFar)} calendar days so far${currentWeek.latestCompletedDate ? `, through ${formatDate(currentWeek.latestCompletedDate)}` : ""}`
                      : "No current-week data has been modeled yet."
                  }
                  icon={Activity}
                  trend={
                    currentWeekPct !== null
                      ? {
                          direction: "neutral",
                          value: `${currentWeekPct}%`,
                          label: "of last week",
                        }
                      : undefined
                  }
                />
                <MetricCard
                  label="Completed-week streak"
                  value={formatInteger(latest?.activeWeekStreak)}
                  detail={
                    latestStreakStartDate
                      ? `Active every week from ${formatDate(latestStreakStartDate)} to ${formatDate(latest?.weekEndDate)}`
                      : `No run in the week ending ${formatDate(latest?.weekEndDate)}`
                  }
                  icon={Flame}
                  trend={
                    latestStreak > 0 && longestActiveWeekStreak > 0
                      ? {
                          direction: "neutral",
                          value:
                            latestStreak === longestActiveWeekStreak
                              ? "current record"
                              : `${formatInteger(longestActiveWeekStreak - latestStreak)} weeks short`,
                          label:
                            latestStreak === longestActiveWeekStreak
                              ? ""
                              : `vs ${formatInteger(longestActiveWeekStreak)}-week record`,
                        }
                      : undefined
                  }
                />
                <MetricCard
                  label="Latest completed week"
                  value={formatDistance(latest?.weeklyDistanceKm, unit)}
                  detail={`${formatInteger(latest?.runsPerWeek)} runs in week ending ${formatDate(latest?.weekEndDate)}`}
                  icon={Activity}
                  trend={
                    weeklyDistanceTrend
                      ? {
                          direction: weeklyDistanceTrend.direction,
                          value: `${weeklyDistanceTrend.diff > 0 ? "+" : ""}${formatDistance(Math.abs(weeklyDistanceTrend.diff), unit)}`,
                          label: "vs prior week",
                        }
                      : undefined
                  }
                />
              </div>
            );
          }}
        </DataState>
        {dailyContext ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {(() => {
              const recent = recentDailyContext as DailyConsistencyContext;
              const prior = priorDailyContext as DailyConsistencyContext;

              const streakTrend = trendDelta(
                recent.longestDailyRunStreak,
                prior.longestDailyRunStreak,
              );
              const avgStreakTrend = trendDelta(
                recent.averageDailyRunStreak,
                prior.averageDailyRunStreak,
              );
              const breakTrend = trendDelta(
                recent.longestTrainingBreak,
                prior.longestTrainingBreak,
              );
              const avgBreakTrend = trendDelta(
                recent.averageBreakLength,
                prior.averageBreakLength,
              );

              return (
                <>
                  <MetricCard
                    label="Longest daily run streak"
                    value={formatInteger(dailyContext.longestDailyRunStreak)}
                    detail="Consecutive active days in the loaded window"
                    icon={Flame}
                    trend={
                      streakTrend
                        ? {
                            direction: streakTrend.direction,
                            value: `${streakTrend.diff > 0 ? "+" : ""}${formatInteger(streakTrend.diff)}`,
                            label: "vs prior window",
                          }
                        : undefined
                    }
                  />
                  <MetricCard
                    label="Average daily run streak"
                    value={formatDecimal2(dailyContext.averageDailyRunStreak)}
                    detail="Average consecutive run-day streak in the loaded window"
                    icon={Activity}
                    trend={
                      avgStreakTrend
                        ? {
                            direction: avgStreakTrend.direction,
                            value: `${avgStreakTrend.diff > 0 ? "+" : ""}${formatDecimal2(Math.abs(avgStreakTrend.diff))}`,
                            label: "vs prior window",
                          }
                        : undefined
                    }
                  />
                  <MetricCard
                    label="Longest training break"
                    value={formatInteger(dailyContext.longestTrainingBreak)}
                    detail="Consecutive completed days without a run"
                    icon={CalendarX}
                    trend={
                      breakTrend
                        ? {
                            direction: breakTrend.direction,
                            invert: true,
                            value: `${breakTrend.diff > 0 ? "+" : ""}${formatInteger(Math.abs(breakTrend.diff))}`,
                            label: "vs prior window",
                          }
                        : undefined
                    }
                  />
                  <MetricCard
                    label="Average break length"
                    value={formatDecimal2(dailyContext.averageBreakLength)}
                    detail="Mean length across training breaks"
                    icon={CalendarDays}
                    trend={
                      avgBreakTrend
                        ? {
                            direction: avgBreakTrend.direction,
                            invert: true,
                            value: `${avgBreakTrend.diff > 0 ? "+" : ""}${formatDecimal2(Math.abs(avgBreakTrend.diff))}`,
                            label: "vs prior window",
                          }
                        : undefined
                    }
                  />
                </>
              );
            })()}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
