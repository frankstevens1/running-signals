import { AppShell } from "@/app/components/app-shell";
import { DataState } from "@/app/components/data-state";
import { RunFilters } from "@/app/components/run-filters";
import { RunPagination } from "@/app/components/run-pagination";
import { RunTable } from "@/app/components/run-table";
import { RunTimeline } from "@/app/components/run-timeline";
import { SectionHeading } from "@/app/components/section-heading";
import { getRoutes, getRuns } from "@/app/lib/data";
import { explorerPages } from "@/app/lib/page-metadata";
import { parseRunFilters, parseRunView, searchParamsFromRecord } from "@/app/lib/query";

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = await searchParams;
  const params = searchParamsFromRecord(resolved);
  const filters = parseRunFilters(params);
  const view = parseRunView(params);
  const [result, routes] = await Promise.all([getRuns(filters), getRoutes(100)]);
  const routeOptions = routes.status === "ok" ? routes.data : [];

  return (
    <AppShell>
      <div className="space-y-10">
        <SectionHeading
          eyebrow="mart_run_sessions"
          title="Run explorer"
          description="Filter and sort session rows by date, distance, pace, heart rate, route, recovery HR availability, GPS coverage, and recent training context."
          icon={explorerPages.runs.icon}
        />
        <RunFilters params={params} routes={routeOptions} />
        <DataState result={result}>
          {(data) => (
            <div className="space-y-4">
              <RunPagination
                params={params}
                view={view}
                total={data.total}
                limit={data.limit}
                offset={data.offset}
              />
              {view === "table" ? (
                <RunTable runs={data.items} params={params} />
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
