import { formatDistance, shortDate } from "@/app/lib/format";
import type { DayRollup } from "@/app/lib/types";

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
