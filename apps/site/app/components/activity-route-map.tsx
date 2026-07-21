"use client";

import { useEffect, useMemo, useRef } from "react";
import maplibregl, { type GeoJSONSource } from "maplibre-gl";

import type { MapProfileRecord } from "@/app/lib/types";

type Position = [number, number];

type RouteLineCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: Record<string, never>;
    geometry: { type: "LineString"; coordinates: Position[] };
  }>;
};

type MapTheme = {
  accent: string;
  background: string;
  isLight: boolean;
};

function cssToken(styles: CSSStyleDeclaration, name: string, fallback: string) {
  return styles.getPropertyValue(name).trim() || fallback;
}

function readMapTheme(): MapTheme {
  const styles = window.getComputedStyle(document.documentElement);
  return {
    accent: cssToken(styles, "--accent", "#22c55e"),
    background: cssToken(styles, "--background", "#06110a"),
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

function recordPosition(record: MapProfileRecord): Position | null {
  const { latitudeDeg, longitudeDeg } = record;
  if (
    latitudeDeg === null ||
    longitudeDeg === null ||
    latitudeDeg < -90 ||
    latitudeDeg > 90 ||
    longitudeDeg < -180 ||
    longitudeDeg > 180
  ) {
    return null;
  }
  return [longitudeDeg, latitudeDeg];
}

function coordinateSequences(records: MapProfileRecord[]): Position[][] {
  const sequences: Position[][] = [];
  let current: Position[] = [];

  const closeSequence = () => {
    if (current.length >= 2) sequences.push(current);
    current = [];
  };

  for (const record of records) {
    const position = recordPosition(record);
    if (!position) {
      closeSequence();
      continue;
    }
    current.push(position);
  }

  closeSequence();
  return sequences;
}

function routeLineCollection(sequences: Position[][]): RouteLineCollection {
  return {
    type: "FeatureCollection",
    features: sequences.map((coordinates) => ({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates },
    })),
  };
}

function fitCoordinates(map: maplibregl.Map, sequences: Position[][], compact: boolean) {
  const bounds = new maplibregl.LngLatBounds();
  sequences.forEach((sequence) => sequence.forEach((position) => bounds.extend(position)));
  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, {
      padding: compact ? 20 : 48,
      maxZoom: compact ? 15 : 14,
      duration: 0,
    });
  }
}

function applyMapTheme(map: maplibregl.Map, theme: MapTheme) {
  if (map.getLayer("osm")) {
    const paint = rasterPaint(theme);
    map.setPaintProperty("osm", "raster-saturation", paint["raster-saturation"]);
    map.setPaintProperty("osm", "raster-contrast", paint["raster-contrast"]);
    map.setPaintProperty("osm", "raster-brightness-min", paint["raster-brightness-min"]);
    map.setPaintProperty("osm", "raster-brightness-max", paint["raster-brightness-max"]);
  }
  if (map.getLayer("route-line-casing")) {
    map.setPaintProperty("route-line-casing", "line-color", theme.background);
  }
  if (map.getLayer("route-line")) {
    map.setPaintProperty("route-line", "line-color", theme.accent);
  }
}

function syncRouteLine(map: maplibregl.Map, sequences: Position[][], compact: boolean) {
  const collection = routeLineCollection(sequences);
  const theme = readMapTheme();
  map.resize();

  if (!map.getSource("route-line")) {
    map.addSource("route-line", { type: "geojson", data: collection as never });
    map.addLayer({
      id: "route-line-casing",
      type: "line",
      source: "route-line",
      paint: {
        "line-color": theme.background,
        "line-opacity": 0.78,
        "line-width": compact ? 5 : 7,
      },
    });
    map.addLayer({
      id: "route-line",
      type: "line",
      source: "route-line",
      paint: {
        "line-color": theme.accent,
        "line-opacity": compact ? 0.98 : 0.92,
        "line-width": compact ? 3 : 4,
      },
    });
  } else {
    (map.getSource("route-line") as GeoJSONSource).setData(collection as never);
  }

  applyMapTheme(map, theme);
  fitCoordinates(map, sequences, compact);
}

export function ActivityRouteMap({
  records,
  interactive = true,
  compact = false,
  className = "",
  radiusClassName = "rounded-none",
}: {
  records: MapProfileRecord[];
  interactive?: boolean;
  compact?: boolean;
  className?: string;
  radiusClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const sequences = useMemo(() => coordinateSequences(records), [records]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || sequences.length === 0) return;

    const initialTheme = readMapTheme();
    const firstPosition = sequences[0]?.[0] ?? [0, 0];
    const map = new maplibregl.Map({
      container: containerRef.current,
      interactive,
      attributionControl: compact ? false : { compact: true },
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
        layers: [{ id: "osm", type: "raster", source: "osm", paint: rasterPaint(initialTheme) }],
      },
      center: firstPosition,
      zoom: 12,
    });

    if (interactive) {
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    }

    mapRef.current = map;
    const renderRoute = () => syncRouteLine(map, sequences, compact);
    const syncTheme = () => {
      if (map.isStyleLoaded()) applyMapTheme(map, readMapTheme());
    };
    const themeObserver = new MutationObserver(syncTheme);
    const colorScheme = window.matchMedia("(prefers-color-scheme: light)");

    map.on("load", renderRoute);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    colorScheme.addEventListener("change", syncTheme);

    return () => {
      themeObserver.disconnect();
      colorScheme.removeEventListener("change", syncTheme);
      map.off("load", renderRoute);
      map.remove();
      if (mapRef.current === map) mapRef.current = null;
    };
  }, [compact, interactive, sequences]);

  useEffect(() => {
    const map = mapRef.current;
    if (map?.loaded() && sequences.length > 0) syncRouteLine(map, sequences, compact);
  }, [compact, sequences]);

  if (sequences.length === 0) {
    return (
      <div
        className={`flex items-center justify-center border border-dashed border-(--border) bg-(--surface-muted) px-4 font-mono text-sm text-(--text-soft) ${radiusClassName} ${className}`}
      >
        No GPS route
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`overflow-hidden bg-(--surface-muted) ${radiusClassName} ${className}`}
    />
  );
}
