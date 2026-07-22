import { Activity, CalendarDays, CalendarX, Flame } from "lucide-react";

import { ActivityCalendar } from "@/app/components/activity-calendar";
import { AppShell } from "@/app/components/app-shell";
import { DataState } from "@/app/components/data-state";
import { MetricCard } from "@/app/components/metric-card";
import { ScrollReveal } from "@/app/components/motion-reveal";
import { SectionHeading } from "@/app/components/section-heading";
import { currentWeekToDate } from "@/app/lib/current-week";
import { getDays, getWeeks } from "@/app/lib/data";
import { formatDate, formatDecimal2, formatDistance, formatInteger } from "@/app/lib/format";
import { explorerPages } from "@/app/lib/page-metadata";
import { getServerDistanceUnit } from "@/app/lib/server-distance-unit";
import type { DayRollup } from "@/app/lib/types";

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

export default async function ConsistencyPage() {
  const [days, weeks, unit] = await Promise.all([
    getDays(371),
    getWeeks(52),
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
  const today = new Date().toISOString().slice(0, 10);
  const currentWeek =
    days.status === "ok" ? currentWeekToDate(days.data, today) : null;

  return (
    <AppShell>
      <div className="space-y-10">
        <SectionHeading
          eyebrow="mart_days and mart_weeks"
          title="Consistency signals"
          description="Daily rollups update through the latest completed day; weekly history remains limited to completed weeks."
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

            const currentWeekTrend = trendDelta(
              currentWeek?.distanceKm,
              latest?.weeklyDistanceKm,
            );

            const weeklyDistanceTrend = trendDelta(
              latest?.weeklyDistanceKm,
              penultimate?.weeklyDistanceKm,
            );

            return (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Active weeks in view"
                  value={formatInteger(activeWeeks)}
                  detail={`${data.length} completed weeks returned`}
                  icon={CalendarDays}
                />
                <MetricCard
                  label="Current week to date"
                  value={formatDistance(currentWeek?.distanceKm, unit)}
                  detail={
                    currentWeek?.latestCompletedDate
                      ? `${formatInteger(currentWeek.runCount)} runs across ${formatInteger(currentWeek.activeDays)} active days through ${formatDate(currentWeek.latestCompletedDate)}`
                      : "No completed day has been published for this week yet."
                  }
                  icon={Activity}
                  trend={
                    currentWeekTrend
                      ? {
                          direction: currentWeekTrend.direction,
                          value: `${currentWeekTrend.diff > 0 ? "+" : ""}${formatDistance(Math.abs(currentWeekTrend.diff), unit)}`,
                          label: "vs prior week",
                        }
                      : undefined
                  }
                />
                <MetricCard
                  label="Completed-week streak"
                  value={formatInteger(latest?.activeWeekStreak)}
                  detail={`Through ${formatDate(latest?.weekEndDate)}`}
                  icon={Flame}
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
                    detail="Mean length across active-day runs"
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
