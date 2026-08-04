import type { RunSort, SortDirection } from "./query";

export type RunSortOption = {
  sort: RunSort;
  label: string;
  defaultDirection: SortDirection;
};

export const RUN_TABLE_SORT_OPTIONS = [
  { sort: "activity_date", label: "Date", defaultDirection: "desc" },
  { sort: "distance_km", label: "Distance", defaultDirection: "desc" },
  { sort: "avg_pace_min_per_km", label: "Pace", defaultDirection: "asc" },
  { sort: "avg_heart_rate", label: "Avg HR", defaultDirection: "desc" },
  { sort: "total_ascent", label: "Ascent/Descent", defaultDirection: "desc" },
  { sort: "prior_7d_distance_km", label: "Prior 7d", defaultDirection: "desc" },
  { sort: "distance_economy_m_per_beat", label: "Dist Economy", defaultDirection: "desc" },
  { sort: "personal_efficiency_score", label: "Score", defaultDirection: "desc" },
  { sort: "route_id", label: "Route", defaultDirection: "asc" },
] satisfies RunSortOption[];

export function getRunSortState(
  params: URLSearchParams,
  sort: RunSort,
  defaultDirection: SortDirection,
) {
  const active = params.get("sort") === sort || (!params.get("sort") && sort === "activity_date");
  const direction = params.get("direction") === "asc" ? "asc" : "desc";

  return {
    active,
    direction,
    nextDirection: active && direction === "desc" ? "asc" : defaultDirection,
    ariaSort: active ? (direction === "asc" ? "ascending" : "descending") : "none",
  } as const;
}

export function hrefWithRunSort(
  params: URLSearchParams,
  sort: RunSort,
  direction: SortDirection,
): string {
  const nextParams = new URLSearchParams(params);
  nextParams.set("sort", sort);
  nextParams.set("direction", direction);
  nextParams.delete("offset");
  return `/runs?${nextParams.toString()}`;
}
