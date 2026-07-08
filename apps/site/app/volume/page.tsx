import { CalendarDays, Route, TrendingUp } from "lucide-react";

import { AppShell } from "@/app/components/app-shell";
import { DataState } from "@/app/components/data-state";
import { MetricCard } from "@/app/components/metric-card";
import { SectionHeading } from "@/app/components/section-heading";
import {
  MonthlyVolumeChart,
  WeeklyStructureChart,
  WeeklyVolumeChart,
} from "@/app/components/trend-charts";
import { getVolume } from "@/app/lib/data";
import { formatDistance, formatInteger } from "@/app/lib/format";
import { explorerPages } from "@/app/lib/page-metadata";

export default async function VolumePage() {
  const volume = await getVolume();

  return (
    <AppShell>
      <div className="space-y-6">
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

            return (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
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
                    label="Latest year"
                    value={formatDistance(latestYear?.yearlyDistanceKm)}
                    detail={`${formatInteger(latestYear?.activeDays)} active days`}
                    icon={Route}
                  />
                </div>
                <div className="grid gap-6 xl:grid-cols-2">
                  <WeeklyVolumeChart weeks={data.weeks} />
                  <WeeklyStructureChart weeks={data.weeks} />
                  <div className="xl:col-span-2">
                    <MonthlyVolumeChart months={data.months} />
                  </div>
                </div>
              </div>
            );
          }}
        </DataState>
      </div>
    </AppShell>
  );
}
