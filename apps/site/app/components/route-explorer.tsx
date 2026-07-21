"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownUp,
  ArrowUpRight,
  ChevronDown,
  LocateFixed,
  MapPin,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { RouteMap, type MapFocus } from "@/app/components/route-map";
import { useDistanceUnit } from "@/app/components/distance-unit-provider";
import { useRouteRecords } from "@/app/components/route-records-client";
import {
  COUNTRY_BOUNDARIES_URL,
  countryBoundariesFromGeoJson,
  countryFeaturesWithRouteCounts,
  deriveRouteGeography,
  type CountryBoundary,
  type GeographicArea,
} from "@/app/lib/route-geography";
import {
  formatDate,
  formatDistance,
  formatHeartRate,
  formatPace,
  formatRouteId,
} from "@/app/lib/format";
import type { RouteSummary } from "@/app/lib/types";

type RouteFilter = "all" | "short" | "medium" | "long";
type RouteSort = "recent" | "distance" | "pace" | "heartRate";

const controlClass =
  "h-10 w-full rounded-none border border-(--border) bg-(--background) px-3 font-mono text-xs text-(--text) outline-none transition placeholder:text-(--text-soft) focus:border-(--accent) focus:bg-(--surface) focus:ring-1 focus:ring-(--accent)";
const selectControlClass = `${controlClass} appearance-none pr-9`;
const fieldLabelClass =
  "inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-(--text-soft)";

function routeLabel(route: RouteSummary) {
  return `Route ${formatRouteId(route.routeId)}`;
}

function matchesRouteFilter(route: RouteSummary, filter: RouteFilter) {
  if (filter === "all") return true;
  if (route.avgDistanceKm === null) return false;
  if (filter === "short") return route.avgDistanceKm < 5;
  if (filter === "medium") return route.avgDistanceKm >= 5 && route.avgDistanceKm < 10;
  return route.avgDistanceKm >= 10;
}

function compareNullable(
  left: number | null,
  right: number | null,
  direction: "ascending" | "descending",
) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return direction === "ascending" ? left - right : right - left;
}

function sortRoutes(routes: RouteSummary[], sort: RouteSort) {
  return [...routes].sort((left, right) => {
    if (sort === "recent") {
      return (right.latestObservedActivityDate ?? "").localeCompare(
        left.latestObservedActivityDate ?? "",
      );
    }

    if (sort === "distance") {
      return compareNullable(left.avgDistanceKm, right.avgDistanceKm, "descending");
    }

    if (sort === "pace") {
      return compareNullable(left.avgPaceMinPerKm, right.avgPaceMinPerKm, "ascending");
    }

    return compareNullable(left.avgHeartRate, right.avgHeartRate, "ascending");
  });
}

function findArea(areas: GeographicArea[], id: string | null) {
  return id ? areas.find((area) => area.id === id) ?? null : null;
}

function replaceRouteParam(routeId: string | null) {
  const url = new URL(window.location.href);
  if (routeId) {
    url.searchParams.set("routeId", routeId);
  } else {
    url.searchParams.delete("routeId");
  }

  const query = url.searchParams.toString();
  window.history.replaceState(null, "", query ? `${url.pathname}?${query}` : url.pathname);
}

export function RouteExplorer({
  routes,
  initialSelectedRouteId,
}: {
  routes: RouteSummary[];
  initialSelectedRouteId: string | null;
}) {
  const { unit } = useDistanceUnit();
  const [selectedRouteId, setSelectedRouteId] = useState(initialSelectedRouteId);
  const [selectedCountryId, setSelectedCountryId] = useState<string | null>(null);
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [filter, setFilter] = useState<RouteFilter>("all");
  const [sort, setSort] = useState<RouteSort>("recent");
  const [countryBoundaries, setCountryBoundaries] = useState<CountryBoundary[]>([]);
  const [countryBoundariesReady, setCountryBoundariesReady] = useState(false);
  const [locationStatus, setLocationStatus] = useState<
    "idle" | "locating" | "centered" | "error"
  >("idle");
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const explorerRef = useRef<HTMLDivElement | null>(null);
  const mapPanelRef = useRef<HTMLElement | null>(null);
  const routeItemRefs = useRef(new Map<string, HTMLLIElement>());

  useEffect(() => {
    const controller = new AbortController();

    async function loadCountryBoundaries() {
      try {
        const response = await fetch(COUNTRY_BOUNDARIES_URL, { signal: controller.signal });
        if (!response.ok) throw new Error("Country boundary data is unavailable.");
        setCountryBoundaries(countryBoundariesFromGeoJson(await response.json()));
      } catch {
        if (!controller.signal.aborted) setCountryBoundaries([]);
      } finally {
        if (!controller.signal.aborted) setCountryBoundariesReady(true);
      }
    }

    void loadCountryBoundaries();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const explorer = explorerRef.current;
    const mapPanel = mapPanelRef.current;
    if (!explorer || !mapPanel) return;

    const largeScreen = window.matchMedia("(min-width: 1024px)");
    const syncListHeight = () => {
      if (largeScreen.matches) {
        explorer.style.setProperty("--route-map-panel-height", `${mapPanel.offsetHeight}px`);
      } else {
        explorer.style.removeProperty("--route-map-panel-height");
      }
    };
    const resizeObserver = new ResizeObserver(syncListHeight);

    resizeObserver.observe(mapPanel);
    largeScreen.addEventListener("change", syncListHeight);
    syncListHeight();

    return () => {
      resizeObserver.disconnect();
      largeScreen.removeEventListener("change", syncListHeight);
    };
  }, []);

  const geography = useMemo(
    () => deriveRouteGeography(routes, countryBoundaries),
    [countryBoundaries, routes],
  );
  const selectedCountry = useMemo(
    () => findArea(geography.countries, selectedCountryId),
    [geography.countries, selectedCountryId],
  );
  const cityOptions = useMemo(
    () => (selectedCountryId ? geography.citiesByCountryId.get(selectedCountryId) ?? [] : []),
    [geography.citiesByCountryId, selectedCountryId],
  );
  const selectedCity = useMemo(
    () => findArea(cityOptions, selectedCityId),
    [cityOptions, selectedCityId],
  );
  const geographicRouteIds = useMemo(() => {
    if (selectedCity) return new Set(selectedCity.routeIds);
    if (selectedCountry) return new Set(selectedCountry.routeIds);
    return new Set(routes.map((route) => route.routeId));
  }, [routes, selectedCity, selectedCountry]);
  const geographicallyScopedRoutes = useMemo(
    () => routes.filter((route) => geographicRouteIds.has(route.routeId)),
    [geographicRouteIds, routes],
  );
  const visibleRoutes = useMemo(() => {
    const filtered = geographicallyScopedRoutes.filter((route) => matchesRouteFilter(route, filter));

    return sortRoutes(filtered, sort);
  }, [filter, geographicallyScopedRoutes, sort]);
  const visibleRouteIds = useMemo(
    () => new Set(visibleRoutes.map((route) => route.routeId)),
    [visibleRoutes],
  );
  const countryFeatures = useMemo(
    () =>
      countryBoundaries.length > 0
        ? countryFeaturesWithRouteCounts(
            countryBoundaries,
            geography.routeCountryIds,
            visibleRouteIds,
          )
        : null,
    [countryBoundaries, geography.routeCountryIds, visibleRouteIds],
  );
  const activeSelectedRouteId =
    selectedRouteId && visibleRouteIds.has(selectedRouteId) ? selectedRouteId : null;
  const routeRecordState = useRouteRecords(activeSelectedRouteId);

  useEffect(() => {
    if (!activeSelectedRouteId) return;

    routeItemRefs.current.get(activeSelectedRouteId)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [activeSelectedRouteId]);

  const clearRouteSelection = useCallback(() => {
    setSelectedRouteId(null);
    replaceRouteParam(null);
  }, []);

  const clearExplorerContext = useCallback(() => {
    setSelectedRouteId(null);
    setSelectedCountryId(null);
    setSelectedCityId(null);
    setLocationStatus("idle");
    setFocus({
      key: `reset:${Date.now()}`,
      type: "bounds",
      bounds: [-180, -70, 180, 80],
    });
    replaceRouteParam(null);
  }, []);

  const selectRoute = useCallback((routeId: string) => {
    setSelectedRouteId(routeId);
    replaceRouteParam(routeId);
  }, []);

  const selectCountry = useCallback(
    (countryId: string | null) => {
      const country = findArea(geography.countries, countryId);
      setSelectedCountryId(country?.id ?? null);
      setSelectedCityId(null);
      setFocus(
        country
          ? { key: `country:${country.id}`, type: "bounds", bounds: country.bounds }
          : null,
      );
      setLocationStatus("idle");
      clearRouteSelection();
    },
    [clearRouteSelection, geography.countries],
  );

  const selectCity = useCallback(
    (cityId: string | null) => {
      const city = findArea(cityOptions, cityId);
      setSelectedCityId(city?.id ?? null);
      setFocus(city ? { key: `city:${city.id}`, type: "bounds", bounds: city.bounds } : null);
      setLocationStatus("idle");
      clearRouteSelection();
    },
    [cityOptions, clearRouteSelection],
  );

  const locateUser = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus("error");
      return;
    }

    setSelectedCountryId(null);
    setSelectedCityId(null);
    clearRouteSelection();
    setLocationStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFocus({
          key: `location:${position.timestamp}`,
          type: "position",
          position: [position.coords.longitude, position.coords.latitude],
          zoom: 13,
        });
        setLocationStatus("centered");
      },
      () => setLocationStatus("error"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }, [clearRouteSelection]);

  const selectedContextLabel =
    locationStatus === "locating"
      ? "Locating you…"
      : locationStatus === "centered"
        ? "Map centered on your current location."
        : locationStatus === "error"
          ? "Location could not be accessed."
          : selectedCity?.name ?? selectedCountry?.name ?? "All locations";
  const hasActiveMapContext =
    Boolean(activeSelectedRouteId || selectedCountry || selectedCity) || locationStatus !== "idle";

  return (
    <div
      ref={explorerRef}
      className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.8fr)]"
    >
      <section
        ref={mapPanelRef}
        className="flex flex-col overflow-hidden border border-(--border) bg-(--surface) lg:self-start"
      >
        <div className="border-b border-(--border) px-4 py-3">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-(--accent)">
            spatial.route_explorer
          </p>
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-base font-semibold text-(--text)">Route map</h2>
            <p
              className="font-mono text-[10px] uppercase tracking-[0.12em] text-(--text-soft)"
              aria-live="polite"
            >
              {selectedContextLabel}
            </p>
          </div>
        </div>

        <div className="grid gap-3 border-b border-(--border) bg-(--surface-muted) pb-3 pt-2 px-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="space-y-1.5">
            <span className={fieldLabelClass}>
              <MapPin className="size-3" aria-hidden="true" />
              Country
            </span>
            <span className="relative block">
              <select
                value={selectedCountryId ?? ""}
                onChange={(event) => selectCountry(event.target.value || null)}
                disabled={!countryBoundariesReady}
                className={`${selectControlClass} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <option value="">All countries</option>
                {geography.countries.map((country) => (
                  <option key={country.id} value={country.id}>
                    {country.name} ({country.routeIds.length})
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-(--text-soft)" aria-hidden="true" />
            </span>
          </label>

          <label className="space-y-1.5">
            <span className={fieldLabelClass}>
              <MapPin className="size-3" aria-hidden="true" />
              City
            </span>
            <span className="relative block">
              <select
                value={selectedCityId ?? ""}
                onChange={(event) => selectCity(event.target.value || null)}
                disabled={!selectedCountry || cityOptions.length === 0}
                className={`${selectControlClass} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <option value="">All cities</option>
                {cityOptions.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name} ({city.routeIds.length})
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-(--text-soft)" aria-hidden="true" />
            </span>
          </label>

          <div className="flex flex-col justify-end gap-1.5">
            <span className={fieldLabelClass}>
              <LocateFixed className="size-3" aria-hidden="true" />
              Current position
            </span>
            <button
              type="button"
              onClick={locateUser}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-none border border-(--border) bg-(--background) px-3 font-mono text-xs font-medium text-(--text) transition-colors hover:border-(--accent) hover:bg-(--accent-soft) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-2 focus-visible:ring-offset-(--surface)"
            >
              <LocateFixed className="size-4 text-(--accent)" aria-hidden="true" />
              My location
            </button>
          </div>
        </div>

        <RouteMap
          routes={visibleRoutes}
          records={routeRecordState.records ?? []}
          selectedRouteId={activeSelectedRouteId}
          isGeometryLoading={routeRecordState.isLoading}
          geometryError={routeRecordState.error}
          selectedCountryId={selectedCountryId}
          countryFeatures={countryFeatures}
          focus={focus}
          onSelectRoute={selectRoute}
          onSelectCountry={selectCountry}
        />
      </section>

      <section
        className="flex min-h-0 flex-col overflow-hidden border border-(--border) bg-(--surface) lg:h-(--route-map-panel-height)"
      >
        <div className="flex items-center justify-between gap-4 border-b border-(--border) px-4 py-3">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-(--accent)">
              query.route_summaries
            </p>
            <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
              <h2 className="text-base font-semibold text-(--text)">Routes</h2>
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-(--text-soft)" aria-live="polite">
                {visibleRoutes.length.toLocaleString()} of {routes.length.toLocaleString()} routes
              </p>
            </div>
          </div>
          {hasActiveMapContext ? (
            <button
              type="button"
              onClick={clearExplorerContext}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm border border-(--border) px-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-(--text) transition-colors hover:border-(--accent) hover:bg-(--accent-soft) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
            >
              <X className="size-3.5" aria-hidden="true" />
              Clear
            </button>
          ) : null}
        </div>

        <div className="grid gap-3 border-b border-(--border) bg-(--surface-muted) pb-3 pt-2 px-4 grid-cols-2">
          <label className="space-y-1.5">
            <span className={fieldLabelClass}>
              <SlidersHorizontal className="size-3" aria-hidden="true" />
              Filter
            </span>
            <span className="relative block">
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value as RouteFilter)}
                className={selectControlClass}
              >
                <option value="all">All distances</option>
                <option value="short">Short under 5 km</option>
                <option value="medium">5–10 km</option>
                <option value="long">Long 10 km and over</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-(--text-soft)" aria-hidden="true" />
            </span>
          </label>
          <label className="space-y-1.5">
            <span className={fieldLabelClass}>
              <ArrowDownUp className="size-3" aria-hidden="true" />
              Sort
            </span>
            <span className="relative block">
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as RouteSort)}
                className={selectControlClass}
              >
                <option value="recent">Most recent</option>
                <option value="distance">Distance</option>
                <option value="pace">Fastest pace</option>
                <option value="heartRate">Heart rate</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-(--text-soft)" aria-hidden="true" />
            </span>
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto" aria-label="Route list">
          {visibleRoutes.length === 0 ? (
            <div className="p-6 text-center">
              <p className="font-mono text-sm text-(--text)">No routes match this view.</p>
              <p className="mt-1 text-sm text-(--text-soft)">
                Clear the distance filter or broaden the geographic context.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-(--border)">
              {visibleRoutes.map((route) => {
                const selected = route.routeId === activeSelectedRouteId;

                return (
                  <li
                    key={route.routeId}
                    ref={(element) => {
                      if (element) {
                        routeItemRefs.current.set(route.routeId, element);
                      } else {
                        routeItemRefs.current.delete(route.routeId);
                      }
                    }}
                  >
                    <article
                      className={
                        selected
                          ? "border-l-2 border-(--accent) bg-(--accent-soft)"
                          : "border-l-2 border-transparent transition-colors hover:bg-(--surface-muted)"
                      }
                    >
                      <button
                        type="button"
                        onClick={() => selectRoute(route.routeId)}
                        className="block w-full px-4 pb-3 pt-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--accent)"
                        aria-pressed={selected}
                      >
                        <span className="flex items-start justify-between gap-3">
                          <span className="font-mono text-sm font-medium text-(--text)">{routeLabel(route)}</span>
                          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-(--text-soft)">
                            {route.runCount} runs
                          </span>
                        </span>
                        <span className="mt-3 grid grid-cols-3 gap-3 font-mono text-[10px] tabular-nums">
                          <span>
                            <span className="block uppercase tracking-[0.08em] text-(--text-soft)">Distance</span>
                            <span className="mt-1 block text-xs text-(--text)">
                              {formatDistance(route.avgDistanceKm, unit)}
                            </span>
                          </span>
                          <span>
                            <span className="block uppercase tracking-[0.08em] text-(--text-soft)">Pace</span>
                            <span className="mt-1 block text-xs text-(--text)">
                              {formatPace(route.avgPaceMinPerKm, unit)}
                            </span>
                          </span>
                          <span>
                            <span className="block uppercase tracking-[0.08em] text-(--text-soft)">Avg HR</span>
                            <span className="mt-1 block text-xs text-(--text)">
                              {formatHeartRate(route.avgHeartRate)}
                            </span>
                          </span>
                        </span>
                      </button>
                      <div className="flex items-center justify-between gap-3 px-4 pb-3 font-mono text-[10px] text-(--text-soft)">
                        <span>Observed {formatDate(route.latestObservedActivityDate)}</span>
                        <Link
                          href={`/runs?routeId=${encodeURIComponent(route.routeId)}`}
                          className="inline-flex items-center gap-1 font-medium text-(--accent) underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
                        >
                          Runs on this route
                          <ArrowUpRight className="size-3" aria-hidden="true" />
                        </Link>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
