import { RotateCcw, Search } from "lucide-react";

const sortOptions = [
  ["activity_date", "Date"],
  ["distance_km", "Distance"],
  ["avg_pace_min_per_km", "Pace"],
  ["avg_heart_rate", "Avg HR"],
  ["total_ascent", "Ascent"],
  ["prior_7d_distance_km", "Prior 7d distance"],
  ["prior_28d_distance_km", "Prior 28d distance"],
];

export function RunFilters({ params }: { params: URLSearchParams }) {
  const value = (key: string) => params.get(key) ?? "";
  const inputClass =
    "h-8 w-full rounded border border-(--border) bg-(--surface) px-2 text-sm text-(--text) outline-none transition focus:border-(--accent) focus:ring-2 focus:ring-(--accent)";
  const labelClass = "block text-xs font-medium text-(--text-soft)";
  const groupClass = "rounded-md border border-(--border) bg-(--surface-muted) p-3";
  const groupTitleClass = "mb-2 text-xs font-semibold uppercase tracking-normal text-(--accent)";

  return (
    <form className="rounded-md border border-(--border) bg-(--surface) p-3">
      <input type="hidden" name="limit" value={value("limit") || "25"} />
      <div className="grid gap-3 xl:grid-cols-[1.05fr_1.6fr_1.2fr_1.15fr]">
        <div className={groupClass}>
          <p className={groupTitleClass}>Date</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className={labelClass}>From</span>
              <input
                name="dateFrom"
                type="date"
                defaultValue={value("dateFrom")}
                className={inputClass}
              />
            </label>
            <label className="space-y-1">
              <span className={labelClass}>To</span>
              <input
                name="dateTo"
                type="date"
                defaultValue={value("dateTo")}
                className={inputClass}
              />
            </label>
          </div>
        </div>

        <div className={groupClass}>
          <p className={groupTitleClass}>Ranges</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="space-y-1">
              <span className={labelClass}>Distance km</span>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  name="minDistanceKm"
                  inputMode="decimal"
                  aria-label="Minimum distance kilometers"
                  placeholder="Min"
                  defaultValue={value("minDistanceKm")}
                  className={inputClass}
                />
                <input
                  name="maxDistanceKm"
                  inputMode="decimal"
                  aria-label="Maximum distance kilometers"
                  placeholder="Max"
                  defaultValue={value("maxDistanceKm")}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="space-y-1">
              <span className={labelClass}>Pace</span>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  name="minPace"
                  inputMode="decimal"
                  aria-label="Minimum pace"
                  placeholder="Min"
                  defaultValue={value("minPace")}
                  className={inputClass}
                />
                <input
                  name="maxPace"
                  inputMode="decimal"
                  aria-label="Maximum pace"
                  placeholder="Max"
                  defaultValue={value("maxPace")}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="space-y-1">
              <span className={labelClass}>Avg HR</span>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  name="minAvgHr"
                  inputMode="numeric"
                  aria-label="Minimum average heart rate"
                  placeholder="Min"
                  defaultValue={value("minAvgHr")}
                  className={inputClass}
                />
                <input
                  name="maxAvgHr"
                  inputMode="numeric"
                  aria-label="Maximum average heart rate"
                  placeholder="Max"
                  defaultValue={value("maxAvgHr")}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        </div>

        <div className={groupClass}>
          <p className={groupTitleClass}>Route and quality</p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <label className="space-y-1 sm:col-span-2 xl:col-span-1">
              <span className={labelClass}>Route ID</span>
              <input name="routeId" defaultValue={value("routeId")} className={inputClass} />
            </label>
            <label className="space-y-1">
              <span className={labelClass}>Recovery HR</span>
              <select
                name="hasRecoveryHr"
                defaultValue={value("hasRecoveryHr")}
                className={inputClass}
              >
                <option value="">Any</option>
                <option value="true">Available</option>
                <option value="false">Missing</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className={labelClass}>GPS min</span>
              <input
                name="minGpsCoverage"
                inputMode="decimal"
                placeholder="0.9"
                defaultValue={value("minGpsCoverage")}
                className={inputClass}
              />
            </label>
          </div>
        </div>

        <div className={groupClass}>
          <p className={groupTitleClass}>Sort</p>
          <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
            <label className="space-y-1">
              <span className={labelClass}>Field</span>
              <select
                name="sort"
                defaultValue={value("sort") || "activity_date"}
                className={inputClass}
              >
                {sortOptions.map(([sort, label]) => (
                  <option key={sort} value={sort}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className={labelClass}>Dir</span>
              <select
                name="direction"
                defaultValue={value("direction") || "desc"}
                className={inputClass}
              >
                <option value="desc">Desc</option>
                <option value="asc">Asc</option>
              </select>
            </label>
          </div>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <button
              type="submit"
              className="inline-flex h-8 items-center justify-center gap-2 rounded bg-(--accent) px-3 text-sm font-semibold text-(--accent-foreground) hover:bg-(--accent-strong)"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              Apply
            </button>
            <a
              href="/runs"
              aria-label="Reset run filters"
              title="Reset filters"
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-(--border) text-(--text-soft) hover:bg-(--surface) hover:text-(--text)"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </form>
  );
}
