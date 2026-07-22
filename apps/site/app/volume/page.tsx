import { CalendarDays, Route, Ruler, TrendingUp } from "lucide-react";

import { AppShell } from "@/app/components/app-shell";
import { DataState } from "@/app/components/data-state";
import { MetricCard } from "@/app/components/metric-card";
import { ScrollReveal } from "@/app/components/motion-reveal";
import { SectionHeading } from "@/app/components/section-heading";
import {
  MonthlyVolumeChart,
  WeeklyStructureChart,
  WeeklyVolumeChart,
} from "@/app/components/trend-charts";
import { getVolume } from "@/app/lib/data";
import { formatDistance, formatInteger, shortDate } from "@/app/lib/format";
import { explorerPages } from "@/app/lib/page-metadata";
import { getServerDistanceUnit } from "@/app/lib/server-distance-unit";

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

export default async function VolumePage() {
  const [volume, unit] = await Promise.all([getVolume(), getServerDistanceUnit()]);

  return (
    <AppShell>
      <div className="space-y-10">
        <SectionHeading
          eyebrow="mart_weeks, mart_months, mart_years"
          title="Volume trends"
          description="Weekly, monthly, and yearly rollups show accumulated training load, rolling distance, long-run contribution, and active periods."
          icon={explorerPages.volume.icon}
        />
        <DataState result={volume}>
          {(data) => {
            const latestWeek = data.weeks.at(-1);
            const penultimateWeek = data.weeks.at(-2);
            const latestMonth = data.months.at(-1);
            const priorMonth = data.months.at(-2);
            const latestYear = data.years.at(-1);
            const priorYear = data.years.at(-2);
            const longestRunWeek = data.weeks.reduce(
              (selected, week) => {
                if (week.longRunDistanceKm === null) return selected;
                if (selected === null) return week;
                if ((selected.longRunDistanceKm ?? 0) >= week.longRunDistanceKm) return selected;
                return week;
              },
              null as (typeof data.weeks)[number] | null,
            );
            const longestRunDistances = data.weeks
              .map((w) => w.longRunDistanceKm)
              .filter((d): d is number => d != null)
              .sort((a, b) => b - a);
            const previousLongest = longestRunDistances[1] ?? null;

            const rollingTrend = trendDelta(
              latestWeek?.rolling4wDistanceKm,
              penultimateWeek?.rolling4wDistanceKm,
            );

            const monthlyTrend = trendDelta(
              latestMonth?.monthlyDistanceKm,
              priorMonth?.monthlyDistanceKm,
            );

            const longRunTrend = trendDelta(
              longestRunWeek?.longRunDistanceKm,
              previousLongest,
            );

            const yearlyTrend = trendDelta(
              latestYear?.yearlyDistanceKm,
              priorYear?.yearlyDistanceKm,
            );

            return (
              <div className="space-y-10">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    label="Rolling 4w distance"
                    value={formatDistance(latestWeek?.rolling4wDistanceKm, unit)}
                    detail="Latest completed-week window"
                    icon={TrendingUp}
                    trend={
                      rollingTrend
                        ? {
                            direction: rollingTrend.direction,
                            value: `${rollingTrend.diff > 0 ? "+" : ""}${formatDistance(Math.abs(rollingTrend.diff), unit)}`,
                            label: "vs prior week",
                          }
                        : undefined
                    }
                  />
                  <MetricCard
                    label="Latest month"
                    value={formatDistance(latestMonth?.monthlyDistanceKm, unit)}
                    detail={`${formatInteger(latestMonth?.runsPerMonth)} runs`}
                    icon={CalendarDays}
                    trend={
                      monthlyTrend
                        ? {
                            direction: monthlyTrend.direction,
                            value: `${monthlyTrend.diff > 0 ? "+" : ""}${formatDistance(Math.abs(monthlyTrend.diff), unit)}`,
                            label: "vs prior month",
                          }
                        : undefined
                    }
                  />
                  <MetricCard
                    label="Longest run"
                    value={formatDistance(longestRunWeek?.longRunDistanceKm, unit)}
                    detail={`Week of ${shortDate(longestRunWeek?.weekStartDate)}`}
                    icon={Ruler}
                    trend={
                      longRunTrend
                        ? {
                            direction: longRunTrend.direction,
                            value: `${longRunTrend.diff > 0 ? "+" : ""}${formatDistance(Math.abs(longRunTrend.diff), unit)}`,
                            label: "vs previous best",
                          }
                        : undefined
                    }
                  />
                  <MetricCard
                    label="Latest year"
                    value={formatDistance(latestYear?.yearlyDistanceKm, unit)}
                    detail={`${formatInteger(latestYear?.activeDays)} active days`}
                    icon={Route}
                    trend={
                      yearlyTrend
                        ? {
                            direction: yearlyTrend.direction,
                            value: `${yearlyTrend.diff > 0 ? "+" : ""}${formatDistance(Math.abs(yearlyTrend.diff), unit)}`,
                            label: "vs prior year",
                          }
                        : undefined
                    }
                  />
                </div>
                <div className="grid gap-6 xl:grid-cols-2">
                  <ScrollReveal className="h-full">
                    <WeeklyVolumeChart weeks={data.weeks} />
                  </ScrollReveal>
                  <ScrollReveal className="h-full" delayMs={80}>
                    <MonthlyVolumeChart months={data.months} />
                  </ScrollReveal>
                  <ScrollReveal className="xl:col-span-2" delayMs={120}>
                    <WeeklyStructureChart weeks={data.weeks} />
                  </ScrollReveal>
                </div>
              </div>
            );
          }}
        </DataState>
      </div>
    </AppShell>
  );
}
