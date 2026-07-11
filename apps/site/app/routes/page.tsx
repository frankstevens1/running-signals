import { AppShell } from "@/app/components/app-shell";
import { DataState } from "@/app/components/data-state";
import { RouteExplorer } from "@/app/components/route-explorer";
import { SectionHeading } from "@/app/components/section-heading";
import { getRouteSegments, getRoutes } from "@/app/lib/data";
import { explorerPages } from "@/app/lib/page-metadata";
import { getSearchParam } from "@/app/lib/query";

export default async function RoutesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = await searchParams;
  const routeId = getSearchParam(resolved, "routeId");
  const [routes, segments] = await Promise.all([getRoutes(100), getRouteSegments(undefined, 5000)]);

  return (
    <AppShell>
      <div className="space-y-10">
        <SectionHeading
          eyebrow="mart_routes and mart_run_segments"
          title="Route map"
          description="Route centroids are clustered over an OpenStreetMap basemap, with public GPS-derived segment lines available for selection and inspection."
          icon={explorerPages.routes.icon}
        />
        <DataState result={routes}>
          {(routeData) => (
            <DataState result={segments}>
              {(segmentData) => (
                <RouteExplorer
                  routes={routeData}
                  segments={segmentData}
                  initialSelectedRouteId={routeId}
                />
              )}
            </DataState>
          )}
        </DataState>
      </div>
    </AppShell>
  );
}
