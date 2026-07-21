import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import Link from "next/link";

import type { DistanceUnit } from "@/app/lib/distance-unit";
import {
  formatDate,
  formatDistance,
  formatHeartRate,
  formatPace,
  formatPercent,
  formatRouteId,
} from "@/app/lib/format";
import type { RunSort, SortDirection } from "@/app/lib/query";
import type { RunSession } from "@/app/lib/types";

const sortableColumns: Array<{
  sort: RunSort;
  label: string;
  defaultDirection: SortDirection;
}> = [
  { sort: "activity_date", label: "Date", defaultDirection: "desc" },
  { sort: "distance_km", label: "Distance", defaultDirection: "desc" },
  { sort: "avg_pace_min_per_km", label: "Pace", defaultDirection: "asc" },
  { sort: "avg_heart_rate", label: "Avg HR", defaultDirection: "desc" },
  { sort: "total_ascent", label: "Ascent", defaultDirection: "desc" },
  { sort: "prior_28d_distance_km", label: "Prior 28d", defaultDirection: "desc" },
  { sort: "route_id", label: "Route", defaultDirection: "asc" },
  { sort: "record_distance_coverage_ratio", label: "GPS", defaultDirection: "desc" },
];

function sortHref(params: URLSearchParams, sort: RunSort, nextDirection: SortDirection): string {
  const nextParams = new URLSearchParams(params);
  nextParams.set("sort", sort);
  nextParams.set("direction", nextDirection);
  nextParams.delete("offset");
  return `/runs?${nextParams.toString()}`;
}

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />;
  if (direction === "asc") return <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />;
  return <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />;
}

function SortableHeader({
  params,
  sort,
  label,
  defaultDirection,
}: {
  params: URLSearchParams;
  sort: RunSort;
  label: string;
  defaultDirection: SortDirection;
}) {
  const active = params.get("sort") === sort || (!params.get("sort") && sort === "activity_date");
  const direction = params.get("direction") === "asc" ? "asc" : "desc";
  const nextDirection = active && direction === "desc" ? "asc" : defaultDirection;
  const ariaSort = active ? (direction === "asc" ? "ascending" : "descending") : "none";

  return (
    <th className="px-3 py-2.5 font-normal" aria-sort={ariaSort}>
      <Link
        href={sortHref(params, sort, nextDirection)}
        className="inline-flex h-7 items-center gap-1.5 px-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-(--text-soft) hover:bg-(--surface) hover:text-(--text)"
      >
        <span>{label}</span>
        <SortIcon active={active} direction={direction} />
      </Link>
    </th>
  );
}

export function RunTable({
  runs,
  params,
  unit,
}: {
  runs: RunSession[];
  params: URLSearchParams;
  unit: DistanceUnit;
}) {
  if (runs.length === 0) {
    return (
      <div className="border border-dashed border-(--border) bg-(--surface) p-8 font-mono text-xs text-(--text-soft)">
        No runs match the current filters.
      </div>
    );
  }

  return (
    <div className="overflow-hidden border border-(--border) bg-(--surface)">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-(--border) text-sm">
          <thead className="border-b border-(--border) bg-(--surface-muted) text-left text-(--text-soft)">
            <tr>
              {sortableColumns.map((column) => (
                <SortableHeader key={column.sort} params={params} {...column} />
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-(--border)">
            {runs.map((run) => (
              <tr key={run.runId} className="font-mono text-xs transition-colors hover:bg-(--accent-soft)">
                <td className="whitespace-nowrap px-4 py-3 text-(--text)">
                  {formatDate(run.activityDate)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">{formatDistance(run.distanceKm, unit)}</td>
                <td className="whitespace-nowrap px-4 py-3">{formatPace(run.avgPaceMinPerKm, unit)}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  {formatHeartRate(run.avgHeartRate)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {run.totalAscent === null ? "n/a" : `${Math.round(run.totalAscent)} m`}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {formatDistance(run.prior28dDistanceKm, unit)}
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
