"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { ChevronDown, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";

import { distanceFromKm, paceFromMinPerKm, type DistanceUnit } from "@/app/lib/distance-unit";
import { formatDistance, formatRouteId } from "@/app/lib/format";
import {
  EMPTY_RUN_FILTER_BOUNDS,
  hasActiveRunFilterParams,
  hasPersistedRunFilters,
  normalizeRunFilters,
  parseStoredRunFilters,
  RUN_FILTER_STORAGE_KEY,
  runFilterFormValues,
  runFiltersEqual,
  runFiltersFromFormValues,
  runFiltersFromSearchParams,
  serializeRunFilters,
  withRunFilters,
  type RunFilterFormValues,
} from "@/app/lib/run-filter-state";
import type { RouteSummary, RunFilterBounds } from "@/app/lib/types";

function hrefFor(params: URLSearchParams): string {
  const query = params.toString();
  return query ? `/runs?${query}` : "/runs";
}

function formatBound(
  value: number | null,
  convert: (value: number) => string,
): string | undefined {
  return value === null ? undefined : convert(value);
}

function paceMinutesToTimeString(minutes: number): string {
  if (!Number.isFinite(minutes)) return "";
  const mins = Math.floor(minutes);
  const secs = Math.round((minutes - mins) * 60);
  if (secs >= 60) return `${mins + 1}:00`;
  return `${mins}:${String(secs % 60).padStart(2, "0")}`;
}

export function RunFilters({
  paramsString,
  routes,
  unit,
  bounds,
}: {
  paramsString: string;
  routes: RouteSummary[];
  unit: DistanceUnit;
  bounds: RunFilterBounds | null;
}) {
  const router = useRouter();
  const filterBounds = bounds ?? EMPTY_RUN_FILTER_BOUNDS;
  const params = useMemo(() => new URLSearchParams(paramsString), [paramsString]);
  const currentFilters = useMemo(() => {
    const filters = runFiltersFromSearchParams(params, unit);
    return bounds ? normalizeRunFilters(filters, bounds) : filters;
  }, [bounds, params, unit]);
  const defaultValues = useMemo(
    () => runFilterFormValues({}, filterBounds, unit),
    [filterBounds, unit],
  );
  const [values, setValues] = useState<RunFilterFormValues>(() =>
    runFilterFormValues(currentFilters, filterBounds, unit),
  );
  const didRestore = useRef(false);

  useEffect(() => {
    if (!bounds) return;

    if (hasActiveRunFilterParams(params)) {
      didRestore.current = true;
      const rawFilters = runFiltersFromSearchParams(params, unit);
      if (!runFiltersEqual(rawFilters, currentFilters)) {
        const nextParams = withRunFilters(params, currentFilters, unit);
        nextParams.delete("offset");
        router.replace(hrefFor(nextParams), { scroll: false });
      }
      return;
    }

    if (didRestore.current) return;

    try {
      const rawValue = window.localStorage.getItem(RUN_FILTER_STORAGE_KEY);
      const restoredFilters = parseStoredRunFilters(rawValue, bounds);

      if (!restoredFilters) {
        if (rawValue !== null) window.localStorage.removeItem(RUN_FILTER_STORAGE_KEY);
        didRestore.current = true;
        return;
      }

      window.localStorage.setItem(RUN_FILTER_STORAGE_KEY, serializeRunFilters(restoredFilters));

      const nextParams = withRunFilters(params, restoredFilters, unit);
      nextParams.delete("offset");

      if (nextParams.toString() !== paramsString) {
        router.replace(hrefFor(nextParams), { scroll: false });
      }
      didRestore.current = true;
    } catch {
      didRestore.current = true;
    }
  }, [bounds, currentFilters, params, paramsString, router, unit]);

  const selectedRouteId = values.routeId;
  const hasSelectedRouteOption = routes.some((route) => route.routeId === selectedRouteId);
  const controlClass =
    "h-8 w-full rounded-none border border-(--border) bg-(--background) px-2.5 font-mono text-[11px] text-(--text) outline-none transition placeholder:text-(--text-soft) focus:border-(--accent) focus:bg-(--surface) focus:ring-1 focus:ring-(--accent)";
  const selectControlClass = `${controlClass} appearance-none pr-8`;
  const fieldClass = "space-y-1";
  const fieldLabelClass =
    "block font-mono text-[10px] uppercase tracking-[0.12em] text-(--text-soft)";
  const pairedFieldClass = `${fieldClass} sm:col-span-2 xl:col-span-3`;
  const dateMinimum = filterBounds.minActivityDate ?? undefined;
  const dateMaximum = filterBounds.maxActivityDate ?? undefined;
  const distanceMinimum = formatBound(
    filterBounds.minDistanceKm,
    (value) => distanceFromKm(value, unit).toFixed(2),
  );
  const distanceMaximum = formatBound(
    filterBounds.maxDistanceKm,
    (value) => distanceFromKm(value, unit).toFixed(2),
  );
  const paceMinimum = formatBound(filterBounds.minPaceMinPerKm, (value) =>
    paceMinutesToTimeString(paceFromMinPerKm(value, unit)),
  );
  const paceMaximum = formatBound(filterBounds.maxPaceMinPerKm, (value) =>
    paceMinutesToTimeString(paceFromMinPerKm(value, unit)),
  );
  const heartRateMinimum = formatBound(filterBounds.minAvgHeartRate, (value) =>
    String(Math.round(value)),
  );
  const heartRateMaximum = formatBound(filterBounds.maxAvgHeartRate, (value) =>
    String(Math.round(value)),
  );
  const altitudeRangeMinimum = formatBound(filterBounds.minAltitudeRangeM, (value) =>
    String(Math.round(value)),
  );

  function updateValue(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value } as RunFilterFormValues));
  }

  function persist(filters: ReturnType<typeof runFiltersFromFormValues>) {
    try {
      if (hasPersistedRunFilters(filters)) {
        window.localStorage.setItem(RUN_FILTER_STORAGE_KEY, serializeRunFilters(filters));
      } else {
        window.localStorage.removeItem(RUN_FILTER_STORAGE_KEY);
      }
    } catch {
      // Storage is an enhancement; the URL remains the applied filter state.
    }
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const filters = runFiltersFromFormValues(values, bounds, unit);
    const nextParams = withRunFilters(params, filters, unit);
    nextParams.delete("offset");

    persist(filters);
    setValues(runFilterFormValues(filters, filterBounds, unit));

    if (nextParams.toString() !== paramsString) {
      router.push(hrefFor(nextParams), { scroll: false });
    }
  }

  function clearFilters() {
    const nextParams = withRunFilters(params, {}, unit);
    nextParams.delete("offset");

    try {
      window.localStorage.removeItem(RUN_FILTER_STORAGE_KEY);
    } catch {
      // Storage is an enhancement; the URL is still reset below.
    }

    setValues(defaultValues);

    if (nextParams.toString() !== paramsString) {
      router.push(hrefFor(nextParams), { scroll: false });
    }
  }

  return (
    <form onSubmit={applyFilters} className="border border-(--border) bg-(--surface)">
      <div className="flex items-center justify-between gap-4 border-b border-(--border) px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <SlidersHorizontal className="h-4 w-4 shrink-0 text-(--accent)" aria-hidden="true" />
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-(--text)">
              Query parameters
            </p>
            <p className="mt-0.5 text-xs text-(--text-soft)">
              Filter sessions by date, distance, pace, heart rate, and route to narrow the visible list.
            </p>
          </div>
        </div>
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.12em] text-(--signal-ok) sm:block">
          ready
        </span>
      </div>
      <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-6 xl:grid-cols-12 xl:items-end">
        <label className={`${fieldClass} lg:col-span-1 xl:col-span-2`}>
          <span className={fieldLabelClass}>Date from</span>
          <input
            name="dateFrom"
            type="date"
            suppressHydrationWarning
            value={values.dateFrom}
            min={dateMinimum}
            max={values.dateTo || dateMaximum}
            onChange={updateValue}
            className={controlClass}
          />
        </label>

        <label className={`${fieldClass} lg:col-span-1 xl:col-span-2`}>
          <span className={fieldLabelClass}>Date to</span>
          <input
            name="dateTo"
            type="date"
            suppressHydrationWarning
            value={values.dateTo}
            min={values.dateFrom || dateMinimum}
            max={dateMaximum}
            onChange={updateValue}
            className={controlClass}
          />
        </label>

        <label className={`${fieldClass} sm:col-span-2 lg:col-span-2 xl:col-span-4`}>
          <span className={fieldLabelClass}>Route</span>
          <span className="relative block">
            <select
              name="routeId"
              suppressHydrationWarning
              value={values.routeId}
              onChange={updateValue}
              className={selectControlClass}
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
            <ChevronDown
              className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-(--text-soft)"
              aria-hidden="true"
            />
          </span>
        </label>

        <label className={`${fieldClass} lg:col-span-1 xl:col-span-2`}>
          <span className={fieldLabelClass}>Recovery HR</span>
          <span className="relative block">
            <select
              name="hasRecoveryHr"
              suppressHydrationWarning
              value={values.hasRecoveryHr}
              onChange={updateValue}
              className={selectControlClass}
            >
              <option value="">Any</option>
              <option value="true">Available</option>
              <option value="false">Missing</option>
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-(--text-soft)"
              aria-hidden="true"
            />
          </span>
        </label>

        <label className={`${fieldClass} lg:col-span-1 xl:col-span-2`}>
          <span className={fieldLabelClass}>Min Alt range m</span>
          <input
            name="minAltitudeRange"
            type="number"
            suppressHydrationWarning
            inputMode="decimal"
            min={altitudeRangeMinimum}
            step="any"
            aria-label="Minimum route altitude range in metres"
            value={values.minAltitudeRange}
            onChange={updateValue}
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
              min={distanceMinimum}
              max={values.maxDistance || distanceMaximum}
              step="any"
              aria-label={`Minimum distance in ${unit === "mi" ? "miles" : "kilometres"}`}
              value={values.minDistance}
              onChange={updateValue}
              className={controlClass}
            />
            <input
              name="maxDistance"
              type="number"
              suppressHydrationWarning
              inputMode="decimal"
              min={values.minDistance || distanceMinimum}
              max={distanceMaximum}
              step="any"
              aria-label={`Maximum distance in ${unit === "mi" ? "miles" : "kilometres"}`}
              value={values.maxDistance}
              onChange={updateValue}
              className={controlClass}
            />
          </div>
        </fieldset>

        <fieldset className={pairedFieldClass}>
          <legend className={fieldLabelClass}>Pace min/{unit}</legend>
          <div className="grid grid-cols-2 gap-2">
            <input
              name="minPace"
              type="text"
              suppressHydrationWarning
              inputMode="numeric"
              pattern="\d{1,2}(:\d{1,2})?"
              placeholder={paceMinimum ?? ""}
              aria-label={`Minimum pace in min:sec per ${unit === "mi" ? "mile" : "kilometre"}`}
              value={values.minPace}
              onChange={updateValue}
              className={controlClass}
            />
            <input
              name="maxPace"
              type="text"
              suppressHydrationWarning
              inputMode="numeric"
              pattern="\d{1,2}(:\d{1,2})?"
              placeholder={paceMaximum ?? ""}
              aria-label={`Maximum pace in min:sec per ${unit === "mi" ? "mile" : "kilometre"}`}
              value={values.maxPace}
              onChange={updateValue}
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
              inputMode="decimal"
              min={heartRateMinimum}
              max={values.maxAvgHr || heartRateMaximum}
              step="any"
              aria-label="Minimum average heart rate"
              value={values.minAvgHr}
              onChange={updateValue}
              className={controlClass}
            />
            <input
              name="maxAvgHr"
              type="number"
              suppressHydrationWarning
              inputMode="decimal"
              min={values.minAvgHr || heartRateMinimum}
              max={heartRateMaximum}
              step="any"
              aria-label="Maximum average heart rate"
              value={values.maxAvgHr}
              onChange={updateValue}
              className={controlClass}
            />
          </div>
        </fieldset>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:col-span-2 lg:col-span-6 xl:col-span-3">
          <button
            type="submit"
            className="inline-flex h-8 min-w-0 items-center justify-center gap-2 bg-(--accent) px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-(--accent-foreground) transition-colors hover:bg-(--accent-strong)"
          >
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            Apply
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex h-8 items-center justify-center gap-2 border border-(--border) px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-(--text-soft) transition-colors hover:border-(--text-soft) hover:bg-(--surface-muted) hover:text-(--text)"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </form>
  );
}
