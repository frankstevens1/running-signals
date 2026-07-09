import { formatDistance, shortDate } from "@/app/lib/format";
import type { DayRollup } from "@/app/lib/types";
import {
  MetricInfoDialog,
  type MetricInfoContent,
} from "@/app/components/metric-info-dialog";

const ACTIVITY_CALENDAR_INFO = {
  title: "Daily activity calendar",
  definition:
    "Each square is a completed calendar day in the loaded window. Color intensity is based on total run distance for that day. Days with no run use the muted color.",
  source: "dbt mart_days, from daily run_count and distance_km.",
  interpretation: [
    "Dense clusters of colored days show periods of regular running.",
    "Darker squares show higher daily distance, not necessarily better training.",
    "Long muted runs show stretches without a recorded run in this data set.",
  ],
  caveats: [
    "The calendar only reflects running distance. It does not include walking, cycling, strength work, or planned rest.",
    "A muted day can be a rest day, a missing-data day, or simply a day with no run.",
  ],
} satisfies MetricInfoContent;

function intensity(day: DayRollup): string {
  if (day.distanceKm <= 0) return "bg-(--surface-muted)";
  if (day.distanceKm < 5) return "bg-emerald-200";
  if (day.distanceKm < 10) return "bg-emerald-400";
  if (day.distanceKm < 16) return "bg-teal-500";
  return "bg-cyan-700";
}

export function ActivityCalendar({ days }: { days: DayRollup[] }) {
  if (days.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-(--border) bg-(--surface) p-8 text-sm text-(--text-soft)">
        No day rows returned from mart_days.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-(--border) bg-(--surface) p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-(--text)">Daily activity calendar</h2>
          <p className="mt-1 text-sm text-(--text-soft)">
            Daily running distance intensity across the loaded window.
          </p>
        </div>
        <MetricInfoDialog content={ACTIVITY_CALENDAR_INFO} />
      </div>
      <div className="grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto pb-2">
        {days.map((day) => (
          <div
            key={day.calendarDate}
            title={`${shortDate(day.calendarDate)}: ${formatDistance(day.distanceKm)}`}
            className={`h-4 w-4 rounded-sm ${intensity(day)}`}
          />
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-(--text-soft)">
        <span>Less</span>
        <span className="h-3 w-3 rounded-sm bg-(--surface-muted)" />
        <span className="h-3 w-3 rounded-sm bg-emerald-200" />
        <span className="h-3 w-3 rounded-sm bg-emerald-400" />
        <span className="h-3 w-3 rounded-sm bg-teal-500" />
        <span className="h-3 w-3 rounded-sm bg-cyan-700" />
        <span>More distance</span>
      </div>
    </div>
  );
}
