"use client";

import { useCallback, useMemo, useState } from "react";
import { X } from "lucide-react";

import { RouteMap } from "@/app/components/route-map";
import {
  formatDate,
  formatDistance,
  formatHeartRate,
  formatPace,
  formatRouteId,
} from "@/app/lib/format";
import type { RouteSegment, RouteSummary } from "@/app/lib/types";

export function RouteExplorer({
  routes,
  segments,
  initialSelectedRouteId,
}: {
  routes: RouteSummary[];
  segments: RouteSegment[];
  initialSelectedRouteId: string | null;
}) {
  const [selectedRouteId, setSelectedRouteId] = useState(initialSelectedRouteId);
  const selectedRoute = useMemo(
    () => routes.find((route) => route.routeId === selectedRouteId) ?? null,
    [routes, selectedRouteId],
  );

  const selectRoute = useCallback((routeId: string) => {
    setSelectedRouteId(routeId);

    const url = new URL(window.location.href);
    url.searchParams.set("routeId", routeId);
    window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}`);
  }, []);

  const clearRoute = useCallback(() => {
    setSelectedRouteId(null);

    const url = new URL(window.location.href);
    url.searchParams.delete("routeId");
    window.history.replaceState(null, "", url.pathname);
  }, []);

  return (
    <div className="space-y-4">
      <RouteMap
        routes={routes}
        segments={segments}
        selectedRouteId={selectedRouteId}
        onSelectRoute={selectRoute}
      />

      <section className="overflow-hidden rounded-sm border border-(--border) bg-(--surface)">
        <div className="flex flex-col gap-3 border-b border-(--border) p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-(--accent)">
              query.route_summaries
            </p>
            <h2 className="mt-1 text-base font-semibold text-(--text)">Route summaries</h2>
            <p className="mt-1 text-sm text-(--text-soft)" aria-live="polite">
              {selectedRoute
                ? `Selected route ${formatRouteId(selectedRoute.routeId)}`
                : `${routes.length.toLocaleString()} route clusters available for inspection.`}
            </p>
          </div>
          {selectedRoute ? (
            <button
              type="button"
              onClick={clearRoute}
              className="inline-flex h-9 w-fit items-center gap-2 rounded-sm border border-(--border) px-3 font-mono text-xs font-medium text-(--text) transition-colors hover:border-(--accent) hover:bg-(--accent-soft) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-2 focus-visible:ring-offset-(--surface)"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Clear selection
            </button>
          ) : null}
        </div>

        {routes.length === 0 ? (
          <div className="p-6 font-mono text-sm text-(--text-soft)">
            No route summaries are available.
          </div>
        ) : (
          <>
            <div className="divide-y divide-(--border) md:hidden">
              {routes.map((route) => {
                const selected = route.routeId === selectedRouteId;

                return (
                  <article
                    key={route.routeId}
                    className={
                      selected
                        ? "border-l-2 border-(--accent) bg-(--accent-soft) p-4"
                        : "border-l-2 border-transparent p-4"
                    }
                  >
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => selectRoute(route.routeId)}
                        className="font-mono text-sm font-medium text-(--accent) underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
                        aria-pressed={selected}
                      >
                        {formatRouteId(route.routeId)}
                      </button>
                      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-(--text-soft)">
                        {selected ? "selected" : `${route.runCount} runs`}
                      </span>
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 font-mono text-xs tabular-nums">
                      <div>
                        <dt className="uppercase tracking-[0.1em] text-(--text-soft)">Distance</dt>
                        <dd className="mt-1 text-(--text)">
                          {formatDistance(route.avgDistanceKm)} avg
                        </dd>
                      </div>
                      <div>
                        <dt className="uppercase tracking-[0.1em] text-(--text-soft)">Pace</dt>
                        <dd className="mt-1 text-(--text)">
                          {formatPace(route.avgPaceMinPerKm)}
                        </dd>
                      </div>
                      <div>
                        <dt className="uppercase tracking-[0.1em] text-(--text-soft)">Heart rate</dt>
                        <dd className="mt-1 text-(--text)">
                          {formatHeartRate(route.avgHeartRate)}
                        </dd>
                      </div>
                      <div>
                        <dt className="uppercase tracking-[0.1em] text-(--text-soft)">Ascent</dt>
                        <dd className="mt-1 text-(--text)">
                          {route.avgTotalAscent === null
                            ? "n/a"
                            : `${Math.round(route.avgTotalAscent)} m`}
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-4 border-t border-(--border) pt-3 font-mono text-[10px] text-(--text-soft)">
                      observed {formatDate(route.firstObservedActivityDate)} –{" "}
                      {formatDate(route.latestObservedActivityDate)}
                    </p>
                  </article>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-(--border) font-mono text-xs tabular-nums">
                <thead className="bg-(--surface-muted) text-left text-[10px] uppercase tracking-[0.12em] text-(--text-soft)">
                  <tr>
                    <th className="px-4 py-3 font-medium">Route</th>
                    <th className="px-4 py-3 font-medium">Runs</th>
                    <th className="px-4 py-3 font-medium">Avg distance</th>
                    <th className="px-4 py-3 font-medium">Avg pace</th>
                    <th className="px-4 py-3 font-medium">Avg HR</th>
                    <th className="px-4 py-3 font-medium">Ascent</th>
                    <th className="px-4 py-3 font-medium">Observed range</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--border)">
                  {routes.map((route) => {
                    const selected = route.routeId === selectedRouteId;

                    return (
                      <tr
                        key={route.routeId}
                        className={
                          selected
                            ? "bg-(--accent-soft) text-(--text)"
                            : "text-(--text-soft) transition-colors hover:bg-(--surface-muted)"
                        }
                      >
                        <td className="whitespace-nowrap px-4 py-3">
                          <button
                            type="button"
                            onClick={() => selectRoute(route.routeId)}
                            className="text-(--accent) underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
                            aria-pressed={selected}
                          >
                            {formatRouteId(route.routeId)}
                          </button>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">{route.runCount}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {formatDistance(route.avgDistanceKm)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {formatPace(route.avgPaceMinPerKm)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {formatHeartRate(route.avgHeartRate)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {route.avgTotalAscent === null
                            ? "n/a"
                            : `${Math.round(route.avgTotalAscent)} m`}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {formatDate(route.firstObservedActivityDate)} -{" "}
                          {formatDate(route.latestObservedActivityDate)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
