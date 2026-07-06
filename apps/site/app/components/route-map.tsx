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

function routePointPaint(selectedRouteId: string | null): CircleLayerSpecification["paint"] {
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
      "#fbbf24",
      "#22d3ee",
    ] as const,
    "circle-opacity": 0.86,
    "circle-stroke-color": "#07111f",
    "circle-stroke-width": 2,
  };
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
  const [ready, setReady] = useState(false);
  const usableSegments = useMemo(() => validSegments(segments), [segments]);
  const routeRunCounts = useMemo(
    () => new Map(routes.map((route) => [route.routeId, route.runCount])),
    [routes],
  );

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

    mapRef.current = new maplibregl.Map({
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
            paint: {
              "raster-saturation": -0.65,
              "raster-contrast": 0.08,
              "raster-brightness-min": 0.18,
              "raster-brightness-max": 0.75,
            },
          },
        ],
      },
      center: [0, 0],
      zoom: 1,
      attributionControl: { compact: true },
    });

    mapRef.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current.on("load", () => setReady(true));

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    if (!map.getSource("route-lines")) {
      map.addSource("route-lines", { type: "geojson", data: lineCollection as never });
      map.addLayer({
        id: "route-lines",
        type: "line",
        source: "route-lines",
        paint: {
          "line-color": "#22d3ee",
          "line-opacity": 0.28,
          "line-width": 2,
        },
      });
      map.addLayer({
        id: "selected-route-lines",
        type: "line",
        source: "route-lines",
        filter: ["==", ["get", "routeId"], selectedRouteId ?? ""],
        paint: {
          "line-color": "#fbbf24",
          "line-opacity": 0.95,
          "line-width": 4,
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
          "circle-color": "#16a34a",
          "circle-opacity": 0.82,
          "circle-radius": [
            "step",
            ["get", "run_count_sum"],
            18,
            10,
            24,
            30,
            32,
          ],
          "circle-stroke-color": "#07111f",
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
          "text-color": "#f8fafc",
        },
      });
      map.addLayer({
        id: "route-points",
        type: "circle",
        source: "route-centroids",
        filter: ["!", ["has", "point_count"]],
        paint: routePointPaint(selectedRouteId),
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
          "text-color": "#07111f",
        },
      });
    } else {
      (map.getSource("route-centroids") as GeoJSONSource).setData(pointCollection as never);
    }

    map.setFilter("selected-route-lines", ["==", ["get", "routeId"], selectedRouteId ?? ""]);
    const selectedPointColor = routePointPaint(selectedRouteId)?.["circle-color"];
    if (selectedPointColor) {
      map.setPaintProperty("route-points", "circle-color", selectedPointColor);
    }

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
      <div className="flex h-[520px] items-center justify-center rounded-md border border-dashed border-(--border) bg-(--surface) p-6 text-center text-sm text-(--text-soft)">
        No GPS route segments are available for clustering.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-(--border) bg-(--surface)">
      <div ref={containerRef} className="h-[520px] w-full" />
    </div>
  );
}
