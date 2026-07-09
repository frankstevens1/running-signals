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

function syncRouteLine(map: maplibregl.Map, coordinates: Position[], compact: boolean) {
  const collection = routeLineCollection(coordinates);
  map.resize();

  if (!map.getSource("route-line")) {
    map.addSource("route-line", { type: "geojson", data: collection as never });
    map.addLayer({
      id: "route-line-casing",
      type: "line",
      source: "route-line",
      paint: {
        "line-color": "#04111d",
        "line-opacity": 0.72,
        "line-width": compact ? 5 : 7,
      },
    });
    map.addLayer({
      id: "route-line",
      type: "line",
      source: "route-line",
      paint: {
        "line-color": "#22d3ee",
        "line-opacity": compact ? 0.98 : 0.92,
        "line-width": compact ? 3 : 4,
      },
    });
  } else {
    (map.getSource("route-line") as GeoJSONSource).setData(collection as never);
  }

  fitCoordinates(map, coordinates, compact);
}

export function RunSegmentMap({
  segments,
  interactive = true,
  compact = false,
  className = "",
  radiusClassName = "rounded-md",
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
            paint: {
              "raster-saturation": -0.7,
              "raster-contrast": 0.04,
              "raster-brightness-min": 0.15,
              "raster-brightness-max": 0.78,
            },
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

    map.on("load", renderRoute);

    return () => {
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
        className={`flex items-center justify-center border border-dashed border-(--border) bg-(--surface-muted) px-4 text-sm text-(--text-soft) ${radiusClassName} ${className}`}
      >
        No GPS route
      </div>
    );
  }

  return <div ref={containerRef} className={`${radiusClassName} ${className}`} />;
}
