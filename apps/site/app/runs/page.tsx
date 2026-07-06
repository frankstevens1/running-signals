import { AppShell } from "@/app/components/app-shell";
import { DataState } from "@/app/components/data-state";
import { RunFilters } from "@/app/components/run-filters";
import { RunPagination } from "@/app/components/run-pagination";
import { RunTable } from "@/app/components/run-table";
import { SectionHeading } from "@/app/components/section-heading";
import { getRuns } from "@/app/lib/data";
import { explorerPages } from "@/app/lib/page-metadata";
import { parseRunFilters, searchParamsFromRecord } from "@/app/lib/query";

export const dynamic = "force-dynamic";

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = await searchParams;
  const params = searchParamsFromRecord(resolved);
  const filters = parseRunFilters(params);
  const result = await getRuns(filters);

  return (
    <AppShell>
      <div className="space-y-6">
        <SectionHeading
          eyebrow="mart_run_sessions"
          title="Run explorer"
          description="Filter and sort session rows by date, distance, pace, heart rate, route, recovery HR availability, GPS coverage, and recent training context."
          icon={explorerPages.runs.icon}
        />
        <RunFilters params={params} />
        <DataState result={result}>
          {(data) => (
            <div className="space-y-3">
              <RunPagination
                params={params}
                total={data.total}
                limit={data.limit}
                offset={data.offset}
              />
              <RunTable runs={data.items} />
              <RunPagination
                params={params}
                total={data.total}
                limit={data.limit}
                offset={data.offset}
              />
            </div>
          )}
        </DataState>
      </div>
    </AppShell>
  );
}
