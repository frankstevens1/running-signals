"use client";

import { useCallback, useMemo, useState } from "react";
import { X } from "lucide-react";

import { RouteMap } from "@/app/components/route-map";
import { formatDate, formatDistance, formatHeartRate, formatPace, formatRouteId } from "@/app/lib/format";
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

      <div className="rounded-md border border-(--border) bg-(--surface)">
        <div className="flex flex-col gap-3 border-b border-(--border) p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-(--accent)">
              Route summaries
            </p>
            <p className="mt-1 text-sm text-(--text-soft)">
              {selectedRoute
                ? `Selected route ${formatRouteId(selectedRoute.routeId)}`
                : "Select a bubble or table row to highlight route lines."}
            </p>
          </div>
          {selectedRoute ? (
            <button
              type="button"
              onClick={clearRoute}
              className="inline-flex h-9 w-fit items-center gap-2 rounded-md border border-(--border) px-3 text-sm font-semibold text-(--text) hover:bg-(--surface-muted)"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Clear selection
            </button>
          ) : null}
        </div>

        {routes.length === 0 ? (
          <div className="p-6 text-sm text-(--text-soft)">No route summaries are available.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-(--border) text-sm">
              <thead className="bg-(--surface-muted) text-left text-(--text-soft)">
                <tr>
                  <th className="px-4 py-3 font-medium">Route</th>
                  <th className="px-4 py-3 font-medium">Runs</th>
                  <th className="px-4 py-3 font-medium">Avg distance</th>
                  <th className="px-4 py-3 font-medium">Avg pace</th>
                  <th className="px-4 py-3 font-medium">Avg HR</th>
                  <th className="px-4 py-3 font-medium">Ascent</th>
                  <th className="px-4 py-3 font-medium">Observed</th>
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
                          : "text-(--text-soft) hover:bg-(--surface-muted)"
                      }
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-mono">
                        <button
                          type="button"
                          onClick={() => selectRoute(route.routeId)}
                          className="text-(--accent) hover:underline"
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
        )}
      </div>
    </div>
  );
}
