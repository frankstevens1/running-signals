"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, {
  type CircleLayerSpecification,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";

import {
  countryLabelFeatures,
  type CountryFeatureCollection,
  type MapBounds,
  type MapPosition,
} from "@/app/lib/route-geography";
import type { RouteGeometryRecord, RouteSummary } from "@/app/lib/types";

type LineCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { routeId: string; runId: string };
    geometry: { type: "LineString"; coordinates: MapPosition[] };
  }>;
};

type PointCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { routeId: string; runCount: number };
    geometry: { type: "Point"; coordinates: MapPosition };
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
  text: string;
  signalOk: string;
  signalWarn: string;
  isLight: boolean;
};

export type MapFocus =
  | { key: string; type: "bounds"; bounds: MapBounds }
  | { key: string; type: "position"; position: MapPosition; zoom: number };

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
    text: cssToken(styles, "--text", "#e8efe9"),
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

function isValidPosition(record: RouteGeometryRecord) {
  return (
    record.latitudeDeg !== null &&
    record.latitudeDeg >= -90 &&
    record.latitudeDeg <= 90 &&
    record.longitudeDeg !== null &&
    record.longitudeDeg >= -180 &&
    record.longitudeDeg <= 180
  );
}

function fitRecords(map: maplibregl.Map, records: RouteGeometryRecord[], duration = 500) {
  const bounds = new maplibregl.LngLatBounds();

  records.forEach((record) => {
    if (!isValidPosition(record)) return;
    bounds.extend([record.longitudeDeg ?? 0, record.latitudeDeg ?? 0]);
  });

  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, { padding: 54, maxZoom: 14, duration });
  }
}

function fitBounds(map: maplibregl.Map, bounds: MapBounds) {
  map.fitBounds(
    [
      [bounds[0], bounds[1]],
      [bounds[2], bounds[3]],
    ],
    { padding: 54, maxZoom: 11, duration: 500 },
  );
}

function routeLineFeatures(records: RouteGeometryRecord[]): LineCollection["features"] {
  const features: LineCollection["features"] = [];
  let routeId: string | null = null;
  let runId: string | null = null;
  let coordinates: MapPosition[] = [];

  const closeSequence = () => {
    if (routeId && runId && coordinates.length >= 2) {
      features.push({
        type: "Feature",
        properties: { routeId, runId },
        geometry: { type: "LineString", coordinates },
      });
    }
    coordinates = [];
  };

  for (const record of records) {
    if (record.routeId !== routeId || record.runId !== runId) {
      closeSequence();
      routeId = record.routeId;
      runId = record.runId;
    }

    if (!isValidPosition(record)) {
      closeSequence();
      continue;
    }

    coordinates.push([record.longitudeDeg ?? 0, record.latitudeDeg ?? 0]);
  }

  closeSequence();
  return features;
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

function applyCountryStyles(
  map: maplibregl.Map,
  theme: MapTheme,
  selectedCountryId: string | null,
) {
  if (map.getLayer("country-fill")) {
    map.setPaintProperty("country-fill", "fill-color", theme.accent);
    map.setPaintProperty("country-fill", "fill-opacity", [
      "case",
      ["==", ["get", "countryId"], selectedCountryId ?? ""],
      0.34,
      [">", ["get", "routeCount"], 0],
      0.18,
      0.025,
    ] as never);
  }

  if (map.getLayer("country-outline")) {
    map.setPaintProperty("country-outline", "line-color", theme.accentStrong);
  }

  if (map.getLayer("country-count")) {
    map.setPaintProperty("country-count", "text-color", theme.text);
  }
}

function applyMapTheme(
  map: maplibregl.Map,
  theme: MapTheme,
  selectedRouteId: string | null,
  selectedCountryId: string | null,
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

  applyCountryStyles(map, theme, selectedCountryId);
}

function setLayerVisibility(map: maplibregl.Map, layerId: string, visible: boolean) {
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
  }
}

export function RouteMap({
  routes,
  records,
  selectedRouteId,
  selectedCountryId,
  countryFeatures,
  focus,
  onSelectRoute,
  onSelectCountry,
}: {
  routes: RouteSummary[];
  records: RouteGeometryRecord[];
  selectedRouteId: string | null;
  selectedCountryId: string | null;
  countryFeatures: CountryFeatureCollection | null;
  focus: MapFocus | null;
  onSelectRoute: (routeId: string) => void;
  onSelectCountry: (countryId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const selectedRouteIdRef = useRef(selectedRouteId);
  const selectedCountryIdRef = useRef(selectedCountryId);
  const fittedInitialRoutesRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [countryOverview, setCountryOverview] = useState(false);
  const usableRecords = useMemo(() => records.filter(isValidPosition), [records]);
  const routeRunCounts = useMemo(
    () => new Map(routes.map((route) => [route.routeId, route.runCount])),
    [routes],
  );
  const countryLabels = useMemo(
    () => (countryFeatures ? countryLabelFeatures(countryFeatures) : null),
    [countryFeatures],
  );

  useEffect(() => {
    selectedRouteIdRef.current = selectedRouteId;
    selectedCountryIdRef.current = selectedCountryId;
  }, [selectedCountryId, selectedRouteId]);

  const lineCollection = useMemo<LineCollection>(
    () => ({
      type: "FeatureCollection",
      features: routeLineFeatures(records),
    }),
    [records],
  );

  const pointCollection = useMemo<PointCollection>(() => {
    const accumulators = new Map<string, RouteAccumulator>();

    usableRecords.forEach((record) => {
      const routeId = record.routeId;
      if (!routeId) return;

      const current =
        accumulators.get(routeId) ??
        ({
          longitudeTotal: 0,
          latitudeTotal: 0,
          coordinateCount: 0,
        } satisfies RouteAccumulator);

      current.longitudeTotal += record.longitudeDeg ?? 0;
      current.latitudeTotal += record.latitudeDeg ?? 0;
      current.coordinateCount += 1;
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
  }, [routeRunCounts, usableRecords]);

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
      "bottom-left",
    );
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    const syncTheme = () => {
      if (map.isStyleLoaded()) {
        applyMapTheme(
          map,
          readMapTheme(),
          selectedRouteIdRef.current,
          selectedCountryIdRef.current,
        );
      }
    };
    const handleLoad = () => {
      syncTheme();
      setCountryOverview(map.getZoom() <= 5);
      setReady(true);
    };
    const handleZoomEnd = () => setCountryOverview(map.getZoom() <= 5);
    const themeObserver = new MutationObserver(syncTheme);
    const colorScheme = window.matchMedia("(prefers-color-scheme: light)");

    map.on("load", handleLoad);
    map.on("zoomend", handleZoomEnd);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    colorScheme.addEventListener("change", syncTheme);

    return () => {
      resizeObserver.disconnect();
      themeObserver.disconnect();
      colorScheme.removeEventListener("change", syncTheme);
      map.off("load", handleLoad);
      map.off("zoomend", handleZoomEnd);
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
            ["get", "point_count"],
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
          "text-field": ["to-string", ["get", "point_count"]],
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
          "text-field": ["to-string", 1],
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
    applyMapTheme(map, theme, selectedRouteId, selectedCountryId);
  }, [lineCollection, pointCollection, ready, selectedCountryId, selectedRouteId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !countryFeatures) return;
    const theme = readMapTheme();

    if (!map.getSource("countries")) {
      map.addSource("countries", { type: "geojson", data: countryFeatures as never });
      map.addLayer({
        id: "country-fill",
        type: "fill",
        source: "countries",
        paint: {
          "fill-color": theme.accent,
          "fill-opacity": 0.1,
        },
      });
      map.addLayer({
        id: "country-outline",
        type: "line",
        source: "countries",
        paint: {
          "line-color": theme.accentStrong,
          "line-opacity": 0.82,
          "line-width": 1.2,
        },
      });
    } else {
      (map.getSource("countries") as GeoJSONSource).setData(countryFeatures as never);
    }

    if (!map.getSource("country-labels")) {
      map.addSource("country-labels", { type: "geojson", data: countryLabels as never });
      map.addLayer({
        id: "country-count",
        type: "symbol",
        source: "country-labels",
        layout: {
          "text-field": [
            "concat",
            ["get", "countryName"],
            "\n",
            ["to-string", ["get", "routeCount"]],
            " routes",
          ],
          "text-size": 12,
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
          "text-justify": "center",
        },
        paint: {
          "text-color": theme.text,
          "text-halo-color": theme.background,
          "text-halo-width": 1.2,
        },
      });
    } else {
      (map.getSource("country-labels") as GeoJSONSource).setData(countryLabels as never);
    }

    applyCountryStyles(map, theme, selectedCountryId);
  }, [countryFeatures, countryLabels, ready, selectedCountryId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const showCountryOverview = countryOverview && Boolean(countryFeatures);

    ["country-fill", "country-outline", "country-count"].forEach((layerId) =>
      setLayerVisibility(map, layerId, showCountryOverview),
    );
    ["route-lines", "selected-route-lines", "route-clusters", "cluster-count", "route-points", "route-point-count"].forEach(
      (layerId) => setLayerVisibility(map, layerId, !showCountryOverview),
    );
  }, [countryFeatures, countryOverview, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || fittedInitialRoutesRef.current || usableRecords.length === 0) return;

    fitRecords(map, usableRecords, 0);
    fittedInitialRoutesRef.current = true;
  }, [ready, usableRecords]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !selectedRouteId) return;

    fitRecords(
      map,
      usableRecords.filter((record) => record.routeId === selectedRouteId),
    );
  }, [ready, selectedRouteId, usableRecords]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !focus) return;

    if (focus.type === "bounds") {
      fitBounds(map, focus.bounds);
    } else {
      map.easeTo({ center: focus.position, zoom: focus.zoom, duration: 500 });
    }
  }, [focus, ready]);

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
        map.easeTo({ center: coordinates as MapPosition, zoom, duration: 450 });
      });
    };

    const handleRouteClick = (event: MapLayerMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: ["route-points"] })[0];
      const routeId = feature?.properties?.routeId;
      if (typeof routeId === "string") onSelectRoute(routeId);
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !countryFeatures) return;

    const handleCountryClick = (event: MapLayerMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: ["country-fill"] })[0];
      const countryId = feature?.properties?.countryId;
      const routeCount = Number(feature?.properties?.routeCount);
      if (typeof countryId === "string" && routeCount > 0) onSelectCountry(countryId);
    };

    const setPointer = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const clearPointer = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("click", "country-fill", handleCountryClick);
    map.on("mouseenter", "country-fill", setPointer);
    map.on("mouseleave", "country-fill", clearPointer);

    return () => {
      map.off("click", "country-fill", handleCountryClick);
      map.off("mouseenter", "country-fill", setPointer);
      map.off("mouseleave", "country-fill", clearPointer);
    };
  }, [countryFeatures, onSelectCountry, ready]);

  if (usableRecords.length === 0) {
    return (
      <div className="flex h-[520px] items-center justify-center p-6 text-center font-mono text-sm text-(--text-soft) lg:h-[620px]">
        No complete GPS route records are available for mapping.
      </div>
    );
  }

  return <div ref={containerRef} className="h-[520px] w-full lg:h-[620px]" />;
}
