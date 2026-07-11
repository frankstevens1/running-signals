"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, {
  type CircleLayerSpecification,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";

import type { RouteSegment, RouteSummary } from "@/app/lib/types";

type Position = [number, number];

type LineCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { routeId: string; runId: string };
    geometry: { type: "LineString"; coordinates: Position[] };
  }>;
};

type PointCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { routeId: string; runCount: number };
    geometry: { type: "Point"; coordinates: Position };
  }>;
};

type RouteAccumulator = {
  longitudeTotal: number;
  latitudeTotal: number;
  coordinateCount: number;
};

type MapTheme = {
  accent: string;
  accentStrong: string;
  accentForeground: string;
  background: string;
  signalOk: string;
  signalWarn: string;
  isLight: boolean;
};

function cssToken(styles: CSSStyleDeclaration, name: string, fallback: string) {
  return styles.getPropertyValue(name).trim() || fallback;
}

function readMapTheme(): MapTheme {
  const styles = window.getComputedStyle(document.documentElement);

  return {
    accent: cssToken(styles, "--accent", "#22c55e"),
    accentStrong: cssToken(styles, "--accent-strong", "#4ade80"),
    accentForeground: cssToken(styles, "--accent-foreground", "#04110a"),
    background: cssToken(styles, "--background", "#06110a"),
    signalOk: cssToken(styles, "--signal-ok", "#22c55e"),
    signalWarn: cssToken(styles, "--signal-warn", "#f59e0b"),
    isLight: styles.colorScheme.includes("light"),
  };
}

function rasterPaint(theme: MapTheme) {
  return {
    "raster-saturation": -0.82,
    "raster-contrast": theme.isLight ? 0.02 : 0.1,
    "raster-brightness-min": theme.isLight ? 0.58 : 0.12,
    "raster-brightness-max": theme.isLight ? 0.98 : 0.68,
  } as const;
}

function validSegments(segments: RouteSegment[]) {
  return segments.filter(
    (segment) =>
      segment.routeId &&
      segment.segmentStartLatitudeDeg !== null &&
      segment.segmentStartLongitudeDeg !== null &&
      segment.segmentEndLatitudeDeg !== null &&
      segment.segmentEndLongitudeDeg !== null,
  );
}

function fitSegments(map: maplibregl.Map, segments: RouteSegment[], duration = 500) {
  const bounds = new maplibregl.LngLatBounds();

  segments.forEach((segment) => {
    if (
      segment.segmentStartLatitudeDeg === null ||
      segment.segmentStartLongitudeDeg === null ||
      segment.segmentEndLatitudeDeg === null ||
      segment.segmentEndLongitudeDeg === null
    ) {
      return;
    }

    bounds.extend([segment.segmentStartLongitudeDeg, segment.segmentStartLatitudeDeg]);
    bounds.extend([segment.segmentEndLongitudeDeg, segment.segmentEndLatitudeDeg]);
  });

  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, { padding: 54, maxZoom: 14, duration });
  }
}

function routePointPaint(
  selectedRouteId: string | null,
  theme: MapTheme,
): CircleLayerSpecification["paint"] {
  return {
    "circle-radius": [
      "interpolate",
      ["linear"],
      ["get", "runCount"],
      1,
      12,
      10,
      20,
      30,
      28,
    ] as const,
    "circle-color": [
      "case",
      ["==", ["get", "routeId"], selectedRouteId ?? ""],
      theme.signalWarn,
      theme.accent,
    ] as const,
    "circle-opacity": 0.9,
    "circle-stroke-color": theme.background,
    "circle-stroke-width": 2,
  };
}

function applyMapTheme(
  map: maplibregl.Map,
  theme: MapTheme,
  selectedRouteId: string | null,
) {
  if (map.getLayer("osm")) {
    const paint = rasterPaint(theme);
    map.setPaintProperty("osm", "raster-saturation", paint["raster-saturation"]);
    map.setPaintProperty("osm", "raster-contrast", paint["raster-contrast"]);
    map.setPaintProperty(
      "osm",
      "raster-brightness-min",
      paint["raster-brightness-min"],
    );
    map.setPaintProperty(
      "osm",
      "raster-brightness-max",
      paint["raster-brightness-max"],
    );
  }

  if (map.getLayer("route-lines")) {
    map.setPaintProperty("route-lines", "line-color", theme.accent);
  }

  if (map.getLayer("selected-route-lines")) {
    map.setPaintProperty("selected-route-lines", "line-color", theme.signalWarn);
  }

  if (map.getLayer("route-clusters")) {
    map.setPaintProperty("route-clusters", "circle-color", theme.signalOk);
    map.setPaintProperty("route-clusters", "circle-stroke-color", theme.background);
  }

  if (map.getLayer("cluster-count")) {
    map.setPaintProperty("cluster-count", "text-color", theme.accentForeground);
  }

  if (map.getLayer("route-points")) {
    const paint = routePointPaint(selectedRouteId, theme);
    const circleColor = paint?.["circle-color"];
    if (circleColor) {
      map.setPaintProperty("route-points", "circle-color", circleColor);
    }
    map.setPaintProperty("route-points", "circle-stroke-color", theme.background);
  }

  if (map.getLayer("route-point-count")) {
    map.setPaintProperty("route-point-count", "text-color", theme.accentForeground);
  }
}

export function RouteMap({
  routes,
  segments,
  selectedRouteId,
  onSelectRoute,
}: {
  routes: RouteSummary[];
  segments: RouteSegment[];
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const selectedRouteIdRef = useRef(selectedRouteId);
  const [ready, setReady] = useState(false);
  const usableSegments = useMemo(() => validSegments(segments), [segments]);
  const routeRunCounts = useMemo(
    () => new Map(routes.map((route) => [route.routeId, route.runCount])),
    [routes],
  );

  useEffect(() => {
    selectedRouteIdRef.current = selectedRouteId;
  }, [selectedRouteId]);

  const lineCollection = useMemo<LineCollection>(
    () => ({
      type: "FeatureCollection",
      features: usableSegments.map((segment) => ({
        type: "Feature",
        properties: { routeId: segment.routeId ?? "", runId: segment.runId },
        geometry: {
          type: "LineString",
          coordinates: [
            [segment.segmentStartLongitudeDeg ?? 0, segment.segmentStartLatitudeDeg ?? 0],
            [segment.segmentEndLongitudeDeg ?? 0, segment.segmentEndLatitudeDeg ?? 0],
          ],
        },
      })),
    }),
    [usableSegments],
  );

  const pointCollection = useMemo<PointCollection>(() => {
    const accumulators = new Map<string, RouteAccumulator>();

    usableSegments.forEach((segment) => {
      const routeId = segment.routeId;
      if (!routeId) return;

      const current =
        accumulators.get(routeId) ??
        ({
          longitudeTotal: 0,
          latitudeTotal: 0,
          coordinateCount: 0,
        } satisfies RouteAccumulator);

      current.longitudeTotal +=
        (segment.segmentStartLongitudeDeg ?? 0) + (segment.segmentEndLongitudeDeg ?? 0);
      current.latitudeTotal +=
        (segment.segmentStartLatitudeDeg ?? 0) + (segment.segmentEndLatitudeDeg ?? 0);
      current.coordinateCount += 2;
      accumulators.set(routeId, current);
    });

    return {
      type: "FeatureCollection",
      features: Array.from(accumulators.entries()).map(([routeId, accumulator]) => ({
        type: "Feature",
        properties: {
          routeId,
          runCount: routeRunCounts.get(routeId) ?? 1,
        },
        geometry: {
          type: "Point",
          coordinates: [
            accumulator.longitudeTotal / accumulator.coordinateCount,
            accumulator.latitudeTotal / accumulator.coordinateCount,
          ],
        },
      })),
    };
  }, [routeRunCounts, usableSegments]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialTheme = readMapTheme();
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          },
        },
        layers: [
          {
            id: "osm",
            type: "raster",
            source: "osm",
            paint: rasterPaint(initialTheme),
          },
        ],
      },
      center: [0, 0],
      zoom: 1,
      attributionControl: { compact: true },
    });

    mapRef.current = map;
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );

    const syncTheme = () => {
      if (map.isStyleLoaded()) {
        applyMapTheme(map, readMapTheme(), selectedRouteIdRef.current);
      }
    };
    const handleLoad = () => {
      syncTheme();
      setReady(true);
    };
    const themeObserver = new MutationObserver(syncTheme);
    const colorScheme = window.matchMedia("(prefers-color-scheme: light)");

    map.on("load", handleLoad);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    colorScheme.addEventListener("change", syncTheme);

    return () => {
      themeObserver.disconnect();
      colorScheme.removeEventListener("change", syncTheme);
      map.off("load", handleLoad);
      map.remove();
      if (mapRef.current === map) {
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const theme = readMapTheme();

    if (!map.getSource("route-lines")) {
      map.addSource("route-lines", { type: "geojson", data: lineCollection as never });
      map.addLayer({
        id: "route-lines",
        type: "line",
        source: "route-lines",
        paint: {
          "line-color": theme.accent,
          "line-opacity": 0.34,
          "line-width": 1.75,
        },
      });
      map.addLayer({
        id: "selected-route-lines",
        type: "line",
        source: "route-lines",
        filter: ["==", ["get", "routeId"], selectedRouteId ?? ""],
        paint: {
          "line-color": theme.signalWarn,
          "line-opacity": 0.95,
          "line-width": 3.5,
        },
      });
    } else {
      (map.getSource("route-lines") as GeoJSONSource).setData(lineCollection as never);
    }

    if (!map.getSource("route-centroids")) {
      map.addSource("route-centroids", {
        type: "geojson",
        data: pointCollection as never,
        cluster: true,
        clusterMaxZoom: 12,
        clusterRadius: 56,
        clusterProperties: {
          run_count_sum: ["+", ["get", "runCount"]],
        },
      } as never);
      map.addLayer({
        id: "route-clusters",
        type: "circle",
        source: "route-centroids",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": theme.signalOk,
          "circle-opacity": 0.88,
          "circle-radius": [
            "step",
            ["get", "run_count_sum"],
            18,
            10,
            24,
            30,
            32,
          ],
          "circle-stroke-color": theme.background,
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "route-centroids",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["to-string", ["get", "run_count_sum"]],
          "text-size": 12,
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
        },
        paint: {
          "text-color": theme.accentForeground,
        },
      });
      map.addLayer({
        id: "route-points",
        type: "circle",
        source: "route-centroids",
        filter: ["!", ["has", "point_count"]],
        paint: routePointPaint(selectedRouteId, theme),
      });
      map.addLayer({
        id: "route-point-count",
        type: "symbol",
        source: "route-centroids",
        filter: ["!", ["has", "point_count"]],
        layout: {
          "text-field": ["to-string", ["get", "runCount"]],
          "text-size": 11,
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
        },
        paint: {
          "text-color": theme.accentForeground,
        },
      });
    } else {
      (map.getSource("route-centroids") as GeoJSONSource).setData(pointCollection as never);
    }

    map.setFilter("selected-route-lines", ["==", ["get", "routeId"], selectedRouteId ?? ""]);
    const selectedPointColor = routePointPaint(selectedRouteId, theme)?.["circle-color"];
    if (selectedPointColor) {
      map.setPaintProperty("route-points", "circle-color", selectedPointColor);
    }
    applyMapTheme(map, theme, selectedRouteId);

    if (selectedRouteId) {
      fitSegments(
        map,
        usableSegments.filter((segment) => segment.routeId === selectedRouteId),
      );
    } else {
      fitSegments(map, usableSegments, 0);
    }
  }, [lineCollection, pointCollection, ready, selectedRouteId, usableSegments]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const handleClusterClick = (event: MapLayerMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: ["route-clusters"] })[0];
      const clusterId = Number(feature?.properties?.cluster_id);
      const coordinates = feature?.geometry.type === "Point" ? feature.geometry.coordinates : null;
      if (!Number.isFinite(clusterId) || !coordinates) return;

      const source = map.getSource("route-centroids") as GeoJSONSource;
      source.getClusterExpansionZoom(clusterId).then((zoom) => {
        map.easeTo({ center: coordinates as Position, zoom, duration: 450 });
      });
    };

    const handleRouteClick = (event: MapLayerMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: ["route-points"] })[0];
      const routeId = feature?.properties?.routeId;
      if (typeof routeId === "string") {
        onSelectRoute(routeId);
      }
    };

    const setPointer = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const clearPointer = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("click", "route-clusters", handleClusterClick);
    map.on("click", "route-points", handleRouteClick);
    map.on("mouseenter", "route-clusters", setPointer);
    map.on("mouseenter", "route-points", setPointer);
    map.on("mouseleave", "route-clusters", clearPointer);
    map.on("mouseleave", "route-points", clearPointer);

    return () => {
      map.off("click", "route-clusters", handleClusterClick);
      map.off("click", "route-points", handleRouteClick);
      map.off("mouseenter", "route-clusters", setPointer);
      map.off("mouseenter", "route-points", setPointer);
      map.off("mouseleave", "route-clusters", clearPointer);
      map.off("mouseleave", "route-points", clearPointer);
    };
  }, [onSelectRoute, ready]);

  if (usableSegments.length === 0) {
    return (
      <section className="overflow-hidden rounded-sm border border-(--border) bg-(--surface)">
        <div className="border-b border-(--border) px-4 py-3">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-(--accent)">
            spatial.cluster_index
          </p>
          <h2 className="mt-1 text-base font-semibold text-(--text)">Route topology</h2>
        </div>
        <div className="flex h-[460px] items-center justify-center p-6 text-center font-mono text-sm text-(--text-soft)">
          No GPS route segments are available for clustering.
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-sm border border-(--border) bg-(--surface)">
      <div className="flex flex-col gap-3 border-b border-(--border) px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-(--accent)">
            spatial.cluster_index
          </p>
          <h2 className="mt-1 text-base font-semibold text-(--text)">Route topology</h2>
          <p className="mt-1 text-sm text-(--text-soft)">
            Select a route node to isolate its observed GPS segments.
          </p>
        </div>
        <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.12em] text-(--text-soft)">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-(--accent)" aria-hidden="true" />
            Route
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-(--signal-warn)" aria-hidden="true" />
            Selected
          </span>
        </div>
      </div>
      <div ref={containerRef} className="h-[520px] w-full" />
    </section>
  );
}
