import { Activity, CalendarDays, Flame } from "lucide-react";

import { ActivityCalendar } from "@/app/components/activity-calendar";
import { AppShell } from "@/app/components/app-shell";
import { DataState } from "@/app/components/data-state";
import { MetricCard } from "@/app/components/metric-card";
import { SectionHeading } from "@/app/components/section-heading";
import { getDays, getWeeks } from "@/app/lib/data";
import { formatDistance, formatInteger } from "@/app/lib/format";
import { explorerPages } from "@/app/lib/page-metadata";

export default async function ConsistencyPage() {
  const [days, weeks] = await Promise.all([getDays(371), getWeeks(52)]);

  return (
    <AppShell>
      <div className="space-y-6">
        <SectionHeading
          eyebrow="mart_days and mart_weeks"
          title="Consistency signals"
          description="Daily and weekly rollups describe training regularity through active days, active weeks, streak context, and missed weeks."
          icon={explorerPages.consistency.icon}
        />
        <DataState result={weeks}>
          {(data) => {
            const latest = data.at(-1);
            const activeWeeks = data.filter((week) => week.activeWeekFlag).length;
            return (
              <div className="grid gap-4 md:grid-cols-3">
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
                  value={formatDistance(latest?.weeklyDistanceKm)}
                  detail={`${formatInteger(latest?.runsPerWeek)} runs in latest completed week`}
                  icon={Activity}
                />
              </div>
            );
          }}
        </DataState>
        <DataState result={days}>{(data) => <ActivityCalendar days={data} />}</DataState>
      </div>
    </AppShell>
  );
}
