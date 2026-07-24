import { AppShell } from "@/app/components/app-shell";
import { DataState } from "@/app/components/data-state";
import { RouteExplorer } from "@/app/components/route-explorer";
import { SectionHeading } from "@/app/components/section-heading";
import { getRoutes } from "@/app/lib/data";
import { explorerPages } from "@/app/lib/page-metadata";
import { getSearchParam, parseOffset, parsePositiveInt } from "@/app/lib/query";
import { getServerAnalyticsWindow } from "@/app/lib/analytics-window-server";

export default async function RoutesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = await searchParams;
  const routeId = getSearchParam(resolved, "routeId");
  const analyticsWindow = await getServerAnalyticsWindow(resolved);
  const routeOffset = parseOffset(getSearchParam(resolved, "routeOffset"), 0, 100_000);
  const routeLimit = parsePositiveInt(getSearchParam(resolved, "routeLimit"), 25, 100);
  const [routes, comparisonRoutes] = await Promise.all([
    getRoutes(analyticsWindow.primary),
    analyticsWindow.comparison ? getRoutes(analyticsWindow.comparison) : null,
  ]);
  const comparisonRouteCount = comparisonRoutes?.status === "ok"
    ? comparisonRoutes.data.length
    : null;

  return (
    <AppShell>
      <div className="space-y-10">
        <SectionHeading
          eyebrow="mart_routes and mart_map_profile_records"
          title="Routes"
          description="Browse representative route geometry by location, then use the route list to compare and inspect observed running patterns."
          icon={explorerPages.routes.icon}
        />
        <DataState result={routes}>
          {(routeData) => (
            <RouteExplorer
              routes={routeData}
              initialSelectedRouteId={routeId}
              initialOffset={routeOffset}
              initialLimit={routeLimit}
              comparisonRouteCount={comparisonRouteCount}
            />
          )}
        </DataState>
      </div>
    </AppShell>
  );
}
