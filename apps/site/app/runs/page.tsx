import { AppShell } from "@/app/components/app-shell";
import { DataState } from "@/app/components/data-state";
import { RunFilters } from "@/app/components/run-filters";
import { RunPagination } from "@/app/components/run-pagination";
import { RunTable } from "@/app/components/run-table";
import { RunTimeline } from "@/app/components/run-timeline";
import { SectionHeading } from "@/app/components/section-heading";
import { getRunFilterBounds, getRoutes, getRuns } from "@/app/lib/data";
import { explorerPages } from "@/app/lib/page-metadata";
import { parseRunFilters, parseRunView, searchParamsFromRecord } from "@/app/lib/query";
import { clampRunFiltersToBounds } from "@/app/lib/run-filter-state";
import { getServerDistanceUnit } from "@/app/lib/server-distance-unit";
import { getServerAnalyticsWindow } from "@/app/lib/analytics-window-server";

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = await searchParams;
  const params = searchParamsFromRecord(resolved);
  const unit = await getServerDistanceUnit();
  const analyticsWindow = await getServerAnalyticsWindow(resolved);
  const parsedFilters = parseRunFilters(params, unit);
  const view = parseRunView(params);
  const [routes, filterBoundsResult] = await Promise.all([
    getRoutes(analyticsWindow.primary),
    getRunFilterBounds(analyticsWindow.primary),
  ]);
  const routeOptions = routes.status === "ok" ? routes.data : [];
  const filterBounds = filterBoundsResult.status === "ok" ? filterBoundsResult.data : null;
  const filters = filterBounds
    ? clampRunFiltersToBounds(parsedFilters, filterBounds)
    : parsedFilters;
  const [result, comparisonResult] = await Promise.all([
    getRuns(filters, analyticsWindow.primary),
    analyticsWindow.comparison
      ? getRuns({ ...filters, dateFrom: undefined, dateTo: undefined, limit: 1, offset: 0 }, analyticsWindow.comparison)
      : null,
  ]);
  const comparisonTotal = comparisonResult?.status === "ok" ? comparisonResult.data.total : null;

  return (
    <AppShell>
      <div className="space-y-4">
        <SectionHeading
          eyebrow="mart_run_sessions"
          title="Run explorer"
          description="Filter and sort session rows by date, distance, pace, heart rate, route, recovery HR availability, GPS coverage, and recent training context."
          icon={explorerPages.runs.icon}
        />
        <RunFilters
          key={`${unit}:${params.toString()}:${JSON.stringify(filterBounds)}`}
          paramsString={params.toString()}
          routes={routeOptions}
          unit={unit}
          bounds={filterBounds}
        />
        <DataState result={result}>
          {(data) => (
            <div className="space-y-4">
              <RunPagination
                params={params}
                view={view}
                total={data.total}
                limit={data.limit}
                 offset={data.offset}
                 comparisonTotal={comparisonTotal}
              />
              {view === "table" ? (
                <RunTable runs={data.items} params={params} unit={unit} />
              ) : (
                <RunTimeline runs={data.items} />
              )}
            </div>
          )}
        </DataState>
      </div>
    </AppShell>
  );
}
