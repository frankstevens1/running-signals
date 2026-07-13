import { AppShell } from "@/app/components/app-shell";
import { DataState } from "@/app/components/data-state";
import { RouteExplorer } from "@/app/components/route-explorer";
import { SectionHeading } from "@/app/components/section-heading";
import { getRouteRecords, getRoutes } from "@/app/lib/data";
import { explorerPages } from "@/app/lib/page-metadata";
import { getSearchParam } from "@/app/lib/query";

export default async function RoutesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = await searchParams;
  const routeId = getSearchParam(resolved, "routeId");
  const routes = await getRoutes(100);
  const records =
    routes.status === "ok"
      ? await getRouteRecords(routes.data.map((route) => route.routeId))
      : null;

  return (
    <AppShell>
      <div className="space-y-10">
        <SectionHeading
          eyebrow="mart_routes and mart_activity_records"
          title="Routes"
          description="Browse representative route geometry by location, then use the route list to compare and inspect observed running patterns."
          icon={explorerPages.routes.icon}
        />
        <DataState result={routes}>
          {(routeData) => (
            records ? (
              <DataState result={records}>
                {(recordData) => (
                  <RouteExplorer
                    routes={routeData}
                    records={recordData}
                    initialSelectedRouteId={routeId}
                  />
                )}
              </DataState>
            ) : null
          )}
        </DataState>
      </div>
    </AppShell>
  );
}
