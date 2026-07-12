import { RotateCcw, Search, SlidersHorizontal } from "lucide-react";

import { distanceFromKm, type DistanceUnit } from "@/app/lib/distance-unit";
import { formatDistance, formatRouteId } from "@/app/lib/format";
import type { RouteSummary } from "@/app/lib/types";

export function RunFilters({
  params,
  routes,
  unit,
}: {
  params: URLSearchParams;
  routes: RouteSummary[];
  unit: DistanceUnit;
}) {
  const value = (key: string) => params.get(key) ?? "";
  const selectedRouteId = value("routeId");
  const distanceValue = (key: string, legacyKey: string) => {
    const current = value(key);
    if (current) return current;

    const legacyValue = value(legacyKey);
    if (!legacyValue) return "";

    const legacy = Number(legacyValue);
    if (!Number.isFinite(legacy)) return "";

    return String(Number(distanceFromKm(legacy, unit).toFixed(4)));
  };
  const hasSelectedRouteOption = routes.some((route) => route.routeId === selectedRouteId);
  const controlClass =
    "h-10 w-full rounded-none border border-(--border) bg-(--background) px-3 font-mono text-xs text-(--text) outline-none transition placeholder:text-(--text-soft) focus:border-(--accent) focus:bg-(--surface) focus:ring-1 focus:ring-(--accent)";
  const fieldClass = "space-y-1.5";
  const fieldLabelClass =
    "block font-mono text-[10px] uppercase tracking-[0.12em] text-(--text-soft)";
  const pairedFieldClass = `${fieldClass} sm:col-span-2 xl:col-span-3`;

  return (
    <form
      key={`${unit}:${params.toString()}`}
      className="border border-(--border) bg-(--surface)"
    >
      <input type="hidden" name="limit" value={value("limit") || "25"} />
      <input type="hidden" name="sort" value={value("sort") || "activity_date"} />
      <input type="hidden" name="direction" value={value("direction") || "desc"} />
      <input type="hidden" name="view" value={value("view") || "timeline"} />
      <div className="flex items-center justify-between gap-4 border-b border-(--border) px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <SlidersHorizontal className="h-4 w-4 shrink-0 text-(--accent)" aria-hidden="true" />
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-(--text)">
              Query parameters
            </p>
            <p className="mt-0.5 text-xs text-(--text-soft)">
              Narrow the session mart without changing the underlying signal definitions.
            </p>
          </div>
        </div>
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.12em] text-(--signal-ok) sm:block">
          ready
        </span>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-6 xl:grid-cols-12 xl:items-end">
        <label className={`${fieldClass} lg:col-span-1 xl:col-span-2`}>
          <span className={fieldLabelClass}>Date from</span>
          <input
            name="dateFrom"
            type="date"
            suppressHydrationWarning
            defaultValue={value("dateFrom")}
            max={value("dateTo") || undefined}
            className={controlClass}
          />
        </label>

        <label className={`${fieldClass} lg:col-span-1 xl:col-span-2`}>
          <span className={fieldLabelClass}>Date to</span>
          <input
            name="dateTo"
            type="date"
            suppressHydrationWarning
            defaultValue={value("dateTo")}
            min={value("dateFrom") || undefined}
            className={controlClass}
          />
        </label>

        <label className={`${fieldClass} sm:col-span-2 lg:col-span-2 xl:col-span-4`}>
          <span className={fieldLabelClass}>Route</span>
          <select
            name="routeId"
            suppressHydrationWarning
            defaultValue={selectedRouteId}
            className={controlClass + " rounded-none"}
          >
            <option value="">Any route</option>
            {selectedRouteId && !hasSelectedRouteOption ? (
              <option value={selectedRouteId}>{formatRouteId(selectedRouteId)} - selected</option>
            ) : null}
            {routes.map((route) => (
              <option key={route.routeId} value={route.routeId}>
                {formatRouteId(route.routeId)} - {route.runCount} runs -{" "}
                {formatDistance(route.avgDistanceKm, unit)}
              </option>
            ))}
          </select>
        </label>

        <label className={`${fieldClass} lg:col-span-1 xl:col-span-2`}>
          <span className={fieldLabelClass}>Recovery HR</span>
          <select
            name="hasRecoveryHr"
            suppressHydrationWarning
            defaultValue={value("hasRecoveryHr")}
            className={controlClass}
          >
            <option value="">Any</option>
            <option value="true">Available</option>
            <option value="false">Missing</option>
          </select>
        </label>

        <label className={`${fieldClass} lg:col-span-1 xl:col-span-2`}>
          <span className={fieldLabelClass}>GPS min</span>
          <input
            name="minGpsCoverage"
            type="number"
            suppressHydrationWarning
            inputMode="decimal"
            min="0"
            max="1"
            step="0.01"
            placeholder="0.90"
            defaultValue={value("minGpsCoverage")}
            className={controlClass}
          />
        </label>

        <fieldset className={pairedFieldClass}>
          <legend className={fieldLabelClass}>Distance {unit}</legend>
          <div className="grid grid-cols-2 gap-2">
            <input
              name="minDistance"
              type="number"
              suppressHydrationWarning
              inputMode="decimal"
              min="0"
              step="0.1"
              placeholder="5.0"
              aria-label={`Minimum distance in ${unit === "mi" ? "miles" : "kilometres"}`}
              defaultValue={distanceValue("minDistance", "minDistanceKm")}
              className={controlClass}
            />
            <input
              name="maxDistance"
              type="number"
              suppressHydrationWarning
              inputMode="decimal"
              min="0"
              step="0.1"
              placeholder="12.0"
              aria-label={`Maximum distance in ${unit === "mi" ? "miles" : "kilometres"}`}
              defaultValue={distanceValue("maxDistance", "maxDistanceKm")}
              className={controlClass}
            />
          </div>
        </fieldset>

        <fieldset className={pairedFieldClass}>
          <legend className={fieldLabelClass}>Pace min/{unit}</legend>
          <div className="grid grid-cols-2 gap-2">
            <input
              name="minPace"
              type="number"
              suppressHydrationWarning
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="5.00"
              aria-label={`Minimum pace in decimal minutes per ${unit === "mi" ? "mile" : "kilometre"}`}
              defaultValue={value("minPace")}
              className={controlClass}
            />
            <input
              name="maxPace"
              type="number"
              suppressHydrationWarning
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="6.50"
              aria-label={`Maximum pace in decimal minutes per ${unit === "mi" ? "mile" : "kilometre"}`}
              defaultValue={value("maxPace")}
              className={controlClass}
            />
          </div>
        </fieldset>

        <fieldset className={`${fieldClass} sm:col-span-2 lg:col-span-2 xl:col-span-3`}>
          <legend className={fieldLabelClass}>Avg HR bpm</legend>
          <div className="grid grid-cols-2 gap-2">
            <input
              name="minAvgHr"
              type="number"
              suppressHydrationWarning
              inputMode="numeric"
              min="40"
              max="220"
              step="1"
              placeholder="130"
              aria-label="Minimum average heart rate"
              defaultValue={value("minAvgHr")}
              className={controlClass}
            />
            <input
              name="maxAvgHr"
              type="number"
              suppressHydrationWarning
              inputMode="numeric"
              min="40"
              max="220"
              step="1"
              placeholder="170"
              aria-label="Maximum average heart rate"
              defaultValue={value("maxAvgHr")}
              className={controlClass}
            />
          </div>
        </fieldset>

        <div className="grid grid-cols-[minmax(0,1fr)_2.25rem] gap-2 sm:col-span-2 lg:col-span-6 xl:col-span-3">
          <button
            type="submit"
            className="inline-flex h-10 min-w-0 items-center justify-center gap-2 bg-(--accent) px-3 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-(--accent-foreground) transition-colors hover:bg-(--accent-strong)"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            Apply
          </button>
          <a
            href="/runs"
            aria-label="Reset run filters"
            title="Reset filters"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center border border-(--border) text-(--text-soft) transition-colors hover:border-(--text-soft) hover:bg-(--surface-muted) hover:text-(--text)"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </form>
  );
}
