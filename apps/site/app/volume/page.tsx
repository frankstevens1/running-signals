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

export default async function VolumePage() {
  const volume = await getVolume();

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
            const latestMonth = data.months.at(-1);
            const latestYear = data.years.at(-1);
            const longestRunWeek = data.weeks.reduce(
              (selected, week) => {
                if (week.longRunDistanceKm === null) return selected;
                if (selected === null) return week;
                if ((selected.longRunDistanceKm ?? 0) >= week.longRunDistanceKm) return selected;
                return week;
              },
              null as (typeof data.weeks)[number] | null,
            );

            return (
              <div className="space-y-10">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    label="Rolling 4w distance"
                    value={formatDistance(latestWeek?.rolling4wDistanceKm)}
                    detail="Latest completed-week window"
                    icon={TrendingUp}
                  />
                  <MetricCard
                    label="Latest month"
                    value={formatDistance(latestMonth?.monthlyDistanceKm)}
                    detail={`${formatInteger(latestMonth?.runsPerMonth)} runs`}
                    icon={CalendarDays}
                  />
                  <MetricCard
                    label="Longest run"
                    value={formatDistance(longestRunWeek?.longRunDistanceKm)}
                    detail={`Week of ${shortDate(longestRunWeek?.weekStartDate)}`}
                    icon={Ruler}
                  />
                  <MetricCard
                    label="Latest year"
                    value={formatDistance(latestYear?.yearlyDistanceKm)}
                    detail={`${formatInteger(latestYear?.activeDays)} active days`}
                    icon={Route}
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
