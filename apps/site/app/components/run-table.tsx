import Link from "next/link";

import {
  formatDate,
  formatDistance,
  formatHeartRate,
  formatPace,
  formatPercent,
  formatRouteId,
} from "@/app/lib/format";
import type { RunSession } from "@/app/lib/types";

export function RunTable({ runs }: { runs: RunSession[] }) {
  if (runs.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-(--border) bg-(--surface) p-8 text-sm text-(--text-soft)">
        No runs match the current filters.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-(--border) bg-(--surface)">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-(--border) text-sm">
          <thead className="bg-(--surface-muted) text-left text-(--text-soft)">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Distance</th>
              <th className="px-4 py-3 font-medium">Pace</th>
              <th className="px-4 py-3 font-medium">Avg HR</th>
              <th className="px-4 py-3 font-medium">Ascent</th>
              <th className="px-4 py-3 font-medium">Prior 28d</th>
              <th className="px-4 py-3 font-medium">Route</th>
              <th className="px-4 py-3 font-medium">GPS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-(--border)">
            {runs.map((run) => (
              <tr key={run.runId} className="hover:bg-(--surface-muted)">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-(--text)">
                  {formatDate(run.activityDate)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">{formatDistance(run.distanceKm)}</td>
                <td className="whitespace-nowrap px-4 py-3">{formatPace(run.avgPaceMinPerKm)}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  {formatHeartRate(run.avgHeartRate)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {run.totalAscent === null ? "n/a" : `${Math.round(run.totalAscent)} m`}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {formatDistance(run.prior28dDistanceKm)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {run.routeId ? (
                    <Link
                      href={`/routes?routeId=${encodeURIComponent(run.routeId)}`}
                      className="font-mono text-(--accent) hover:underline"
                    >
                      {formatRouteId(run.routeId)}
                    </Link>
                  ) : (
                    "n/a"
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {formatPercent(run.recordDistanceCoverageRatio)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
