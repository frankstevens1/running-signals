import type { DistanceUnit } from "@/app/lib/distance-unit";
import { formatDistance, shortDate } from "@/app/lib/format";
import type { DayRollup } from "@/app/lib/types";
import {
  MetricInfoDialog,
  type MetricInfoContent,
} from "@/app/components/metric-info-dialog";

const ACTIVITY_CALENDAR_INFO = {
  title: "Daily activity calendar",
  definition:
    "Each square is a completed calendar day in the loaded window. Color intensity is based on total run distance for that day. Days with no run use the muted color. Columns represent ISO weeks (Monday–Sunday).",
  source: "dbt mart_days, from daily run_count and distance_km.",
  interpretation: [
    "Each column is one ISO week; empty squares at the start or end of the grid pad partial weeks.",
    "Dense clusters of colored days show periods of regular running.",
    "Darker squares show higher daily distance, not necessarily better training.",
    "Long muted runs show stretches without a recorded run in this data set.",
  ],
  caveats: [
    "The calendar only reflects running distance. It does not include walking, cycling, strength work, or planned rest.",
    "A muted day can be a rest day, a missing-data day, or simply a day with no run.",
  ],
} satisfies MetricInfoContent;

const calendarColors = [
  "var(--surface-muted)",
  "color-mix(in srgb, var(--accent) 20%, var(--surface))",
  "color-mix(in srgb, var(--accent) 42%, var(--surface))",
  "color-mix(in srgb, var(--accent) 70%, var(--surface))",
  "var(--accent)",
] as const;

function isoWeekday(dateStr: string): number {
  const date = new Date(`${dateStr}T00:00:00Z`);
  return (date.getUTCDay() + 6) % 7;
}

function intensityIndex(day: DayRollup): number {
  if (day.distanceKm <= 0) return 0;
  if (day.distanceKm < 5) return 1;
  if (day.distanceKm < 10) return 2;
  if (day.distanceKm < 16) return 3;
  return 4;
}

export function ActivityCalendar({
  days,
  unit,
}: {
  days: DayRollup[];
  unit: DistanceUnit;
}) {
  if (days.length === 0) {
    return (
      <div className="rounded-sm border border-dashed border-(--border) bg-(--surface) p-8 font-mono text-sm text-(--text-soft)">
        No day rows returned from mart_days.
      </div>
    );
  }

  const startPad = isoWeekday(days[0].calendarDate);
  const totalCells = startPad + days.length;
  const endPad = (7 - (totalCells % 7)) % 7;

  return (
    <section className="overflow-hidden rounded-sm border border-(--border) bg-(--surface)">
      <div className="flex items-start justify-between gap-3 border-b border-(--border) px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-(--accent)">
            analysis.output
          </p>
          <h2 className="mt-1 text-base font-semibold text-(--text)">
            Daily activity calendar
          </h2>
          <p className="mt-1 text-sm text-(--text-soft)">
            Daily running distance intensity across the loaded window.
          </p>
        </div>
        <MetricInfoDialog content={ACTIVITY_CALENDAR_INFO} />
      </div>
      <div className="p-4">
        <div
          className="grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto pb-2"
          role="list"
          aria-label="Daily running distance"
        >
          {Array.from({ length: startPad }).map((_, i) => (
            <div key={`pad-start-${i}`} className="size-4" />
          ))}
          {days.map((day) => {
            const label = `${shortDate(day.calendarDate)}: ${formatDistance(day.distanceKm, unit)}`;

            return (
              <div
                key={day.calendarDate}
                title={label}
                role="listitem"
                aria-label={label}
                className="size-4 rounded-[2px] border border-(--border)"
                style={{ backgroundColor: calendarColors[intensityIndex(day)] }}
              />
            );
          })}
          {Array.from({ length: endPad }).map((_, i) => (
            <div key={`pad-end-${i}`} className="size-4" />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-(--text-soft)">
          <span>Less</span>
          {calendarColors.map((color) => (
            <span
              key={color}
              className="size-3 rounded-[1px] border border-(--border)"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            />
          ))}
          <span>More distance</span>
        </div>
      </div>
    </section>
  );
}
