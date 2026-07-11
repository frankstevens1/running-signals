"use client";

import { useEffect, useMemo, useRef } from "react";
import maplibregl, { type GeoJSONSource } from "maplibre-gl";

import type { RouteSegment } from "@/app/lib/types";

type Position = [number, number];

type RouteLineCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: Record<string, never>;
    geometry: {
      type: "LineString";
      coordinates: Position[];
    };
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

function coordinatePairs(segments: RouteSegment[]): Position[] {
  const pairs: Position[] = [];

  for (const segment of segments) {
    if (
      segment.segmentStartLatitudeDeg === null ||
      segment.segmentStartLongitudeDeg === null ||
      segment.segmentEndLatitudeDeg === null ||
      segment.segmentEndLongitudeDeg === null
    ) {
      continue;
    }

    const start: Position = [
      segment.segmentStartLongitudeDeg,
      segment.segmentStartLatitudeDeg,
    ];
    const end: Position = [segment.segmentEndLongitudeDeg, segment.segmentEndLatitudeDeg];

    const last = pairs.at(-1);

    if (!last || last[0] !== start[0] || last[1] !== start[1]) {
      pairs.push(start);
    }

    pairs.push(end);
  }

  return pairs;
}

function fitCoordinates(map: maplibregl.Map, coordinates: Position[], compact: boolean) {
  const bounds = new maplibregl.LngLatBounds();

  for (const coordinate of coordinates) {
    bounds.extend(coordinate);
  }

  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, {
      padding: compact ? 20 : 48,
      maxZoom: compact ? 15 : 14,
      duration: 0,
    });
  }
}

function routeLineCollection(coordinates: Position[]): RouteLineCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates,
        },
      },
    ],
  };
}

function applyMapTheme(map: maplibregl.Map, theme: MapTheme) {
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

  if (map.getLayer("route-line-casing")) {
    map.setPaintProperty("route-line-casing", "line-color", theme.background);
  }

  if (map.getLayer("route-line")) {
    map.setPaintProperty("route-line", "line-color", theme.accent);
  }
}

function syncRouteLine(map: maplibregl.Map, coordinates: Position[], compact: boolean) {
  const collection = routeLineCollection(coordinates);
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
  fitCoordinates(map, coordinates, compact);
}

export function RunSegmentMap({
  segments,
  interactive = true,
  compact = false,
  className = "",
  radiusClassName = "rounded-none",
}: {
  segments: RouteSegment[];
  interactive?: boolean;
  compact?: boolean;
  className?: string;
  radiusClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const coordinates = useMemo(() => coordinatePairs(segments), [segments]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || coordinates.length === 0) {
      return;
    }

    const initialTheme = readMapTheme();
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
        layers: [
          {
            id: "osm",
            type: "raster",
            source: "osm",
            paint: rasterPaint(initialTheme),
          },
        ],
      },
      center: coordinates[0],
      zoom: 12,
    });

    if (interactive) {
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    }

    mapRef.current = map;

    function renderRoute() {
      syncRouteLine(map, coordinates, compact);
    }

    function syncTheme() {
      if (map.isStyleLoaded()) {
        applyMapTheme(map, readMapTheme());
      }
    }

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
      if (mapRef.current === map) {
        mapRef.current = null;
      }
    };
  }, [compact, coordinates, interactive]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !map.loaded() || coordinates.length === 0) {
      return;
    }

    syncRouteLine(map, coordinates, compact);
  }, [compact, coordinates]);

  if (coordinates.length === 0) {
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
