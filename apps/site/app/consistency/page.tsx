import { Activity, CalendarDays, CalendarX, Flame } from "lucide-react";

import { ActivityCalendar } from "@/app/components/activity-calendar";
import { AppShell } from "@/app/components/app-shell";
import { DataState } from "@/app/components/data-state";
import { MetricCard } from "@/app/components/metric-card";
import { ScrollReveal } from "@/app/components/motion-reveal";
import { SectionHeading } from "@/app/components/section-heading";
import { getDays, getWeeks } from "@/app/lib/data";
import { formatDistance, formatInteger, formatNumber } from "@/app/lib/format";
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

export default async function ConsistencyPage() {
  const [days, weeks, unit] = await Promise.all([
    getDays(371),
    getWeeks(52),
    getServerDistanceUnit(),
  ]);
  const dailyContext = days.status === "ok" ? getDailyConsistencyContext(days.data) : null;

  return (
    <AppShell>
      <div className="space-y-10">
        <SectionHeading
          eyebrow="mart_days and mart_weeks"
          title="Consistency signals"
          description="Daily and weekly rollups describe training regularity through active days, active weeks, streak context, and missed weeks."
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
            const activeWeeks = data.filter((week) => week.activeWeekFlag).length;
            const averageWeeklyVolume =
              data.length > 0
                ? data.reduce((total, week) => total + week.weeklyDistanceKm, 0) / data.length
                : null;

            return (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Active weeks in view"
                  value={formatInteger(activeWeeks)}
                  detail={`${data.length} completed weeks returned`}
                  icon={CalendarDays}
                />
                <MetricCard
                  label="Current active streak"
                  value={formatInteger(latest?.activeWeekStreak)}
                  detail="Completed-week streak from mart_weeks"
                  icon={Flame}
                />
                <MetricCard
                  label="Latest weekly volume"
                  value={formatDistance(latest?.weeklyDistanceKm, unit)}
                  detail={`${formatInteger(latest?.runsPerWeek)} runs in latest completed week`}
                  icon={Activity}
                />
                <MetricCard
                  label="Average weekly volume"
                  value={formatDistance(averageWeeklyVolume, unit)}
                  detail="Mean distance across completed weeks returned"
                  icon={Activity}
                />
              </div>
            );
          }}
        </DataState>
        {dailyContext ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Longest daily run streak"
              value={formatInteger(dailyContext.longestDailyRunStreak)}
              detail="Consecutive active days in the loaded window"
              icon={Flame}
            />
            <MetricCard
              label="Average daily run streak"
              value={formatNumber(dailyContext.averageDailyRunStreak)}
              detail="Mean length across active-day runs"
              icon={Activity}
            />
            <MetricCard
              label="Longest training break"
              value={formatInteger(dailyContext.longestTrainingBreak)}
              detail="Consecutive completed days without a run"
              icon={CalendarX}
            />
            <MetricCard
              label="Average break length"
              value={formatNumber(dailyContext.averageBreakLength)}
              detail="Mean length across training breaks"
              icon={CalendarDays}
            />
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
