import type { RouteSummary } from "@/app/lib/types";

export type MapPosition = [number, number];
export type MapBounds = [number, number, number, number];

type PolygonGeometry = {
  type: "Polygon";
  coordinates: MapPosition[][];
};

type MultiPolygonGeometry = {
  type: "MultiPolygon";
  coordinates: MapPosition[][][];
};

type CountryGeometry = PolygonGeometry | MultiPolygonGeometry;

export type CountryBoundary = {
  id: string;
  name: string;
  bounds: MapBounds;
  geometry: CountryGeometry;
};

export type GeographicArea = {
  id: string;
  name: string;
  routeIds: string[];
  center: MapPosition;
  bounds: MapBounds;
};

export type RouteGeography = {
  routeCountryIds: Map<string, string>;
  countries: GeographicArea[];
  citiesByCountryId: Map<string, GeographicArea[]>;
};

export type CountryFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { countryId: string; countryName: string; routeCount: number };
    geometry: CountryGeometry;
  }>;
};

export type CountryLabelCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { countryId: string; countryName: string; routeCount: number };
    geometry: { type: "Point"; coordinates: MapPosition };
  }>;
};

export const COUNTRY_BOUNDARIES_URL =
  "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json";

function isPosition(value: unknown): value is MapPosition {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1])
  );
}

function readPolygonCoordinates(value: unknown): MapPosition[][] | null {
  if (!Array.isArray(value)) return null;

  const rings = value.map((ring) => {
    if (!Array.isArray(ring)) return null;
    const positions = ring.filter(isPosition);
    return positions.length >= 3 ? positions : null;
  });

  return rings.every((ring) => ring !== null) ? (rings as MapPosition[][]) : null;
}

function readGeometry(value: unknown): CountryGeometry | null {
  if (!value || typeof value !== "object") return null;
  const geometry = value as { type?: unknown; coordinates?: unknown };

  if (geometry.type === "Polygon") {
    const coordinates = readPolygonCoordinates(geometry.coordinates);
    return coordinates ? { type: "Polygon", coordinates } : null;
  }

  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    const coordinates = geometry.coordinates.map(readPolygonCoordinates);
    return coordinates.every((polygon) => polygon !== null)
      ? { type: "MultiPolygon", coordinates: coordinates as MapPosition[][][] }
      : null;
  }

  return null;
}

function geometryPositions(geometry: CountryGeometry): MapPosition[] {
  if (geometry.type === "Polygon") return geometry.coordinates.flat();
  return geometry.coordinates.flat(2);
}

function boundsForPositions(positions: MapPosition[]): MapBounds | null {
  if (positions.length === 0) return null;

  let minLongitude = positions[0][0];
  let maxLongitude = positions[0][0];
  let minLatitude = positions[0][1];
  let maxLatitude = positions[0][1];

  for (const [longitude, latitude] of positions) {
    minLongitude = Math.min(minLongitude, longitude);
    maxLongitude = Math.max(maxLongitude, longitude);
    minLatitude = Math.min(minLatitude, latitude);
    maxLatitude = Math.max(maxLatitude, latitude);
  }

  return [minLongitude, minLatitude, maxLongitude, maxLatitude];
}

function ringArea(ring: MapPosition[]) {
  return ring.reduce((area, [longitude, latitude], index) => {
    const [nextLongitude, nextLatitude] = ring[(index + 1) % ring.length];
    return area + longitude * nextLatitude - nextLongitude * latitude;
  }, 0) / 2;
}

function ringCenter(ring: MapPosition[]): MapPosition {
  const signedArea = ringArea(ring);
  if (Math.abs(signedArea) < Number.EPSILON) {
    const bounds = boundsForPositions(ring);
    return bounds
      ? [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2]
      : [0, 0];
  }

  const [longitude, latitude] = ring.reduce(
    ([longitudeTotal, latitudeTotal], [currentLongitude, currentLatitude], index) => {
      const [nextLongitude, nextLatitude] = ring[(index + 1) % ring.length];
      const factor = currentLongitude * nextLatitude - nextLongitude * currentLatitude;
      return [
        longitudeTotal + (currentLongitude + nextLongitude) * factor,
        latitudeTotal + (currentLatitude + nextLatitude) * factor,
      ];
    },
    [0, 0],
  );

  return [longitude / (6 * signedArea), latitude / (6 * signedArea)];
}

export function labelPosition(geometry: CountryGeometry): MapPosition {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const largestPolygon = polygons.reduce((largest, polygon) =>
    Math.abs(ringArea(polygon[0])) > Math.abs(ringArea(largest[0])) ? polygon : largest,
  );

  return ringCenter(largestPolygon[0]);
}

function featureProperty(properties: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    const value = properties[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function countryBoundariesFromGeoJson(value: unknown): CountryBoundary[] {
  if (!value || typeof value !== "object") return [];
  const collection = value as { features?: unknown };
  if (!Array.isArray(collection.features)) return [];

  return collection.features.flatMap((feature) => {
    if (!feature || typeof feature !== "object") return [];
    const item = feature as {
      id?: unknown;
      properties?: unknown;
      geometry?: unknown;
    };
    const properties =
      item.properties && typeof item.properties === "object"
        ? (item.properties as Record<string, unknown>)
        : {};
    const geometry = readGeometry(item.geometry);
    const bounds = geometry ? boundsForPositions(geometryPositions(geometry)) : null;
    const featureId =
      typeof item.id === "string" || typeof item.id === "number" ? String(item.id) : null;
    const id = featureProperty(properties, ["ISO_A3", "iso_a3", "ISO3166-1-Alpha-3"]) ?? featureId;
    const name = featureProperty(properties, ["name", "NAME", "ADMIN"]);

    return id && name && geometry && bounds ? [{ id, name, geometry, bounds }] : [];
  });
}

function routePosition(route: RouteSummary): MapPosition | null {
  const lon = route.representativeRouteCentroidLongitudeDeg;
  const lat = route.representativeRouteCentroidLatitudeDeg;
  if (lon === null || lat === null) return null;
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;
  return [lon, lat];
}

function boundsForArea(positions: MapPosition[]): MapBounds {
  const bounds = boundsForPositions(positions);
  if (!bounds) return [-180, -85, 180, 85];

  const [minLongitude, minLatitude, maxLongitude, maxLatitude] = bounds;
  const horizontalPadding = Math.max((maxLongitude - minLongitude) * 0.16, 0.02);
  const verticalPadding = Math.max((maxLatitude - minLatitude) * 0.16, 0.02);

  return [
    minLongitude - horizontalPadding,
    minLatitude - verticalPadding,
    maxLongitude + horizontalPadding,
    maxLatitude + verticalPadding,
  ];
}

function areaCenter(positions: MapPosition[]): MapPosition {
  const [minLongitude, minLatitude, maxLongitude, maxLatitude] = boundsForArea(positions);
  return [(minLongitude + maxLongitude) / 2, (minLatitude + maxLatitude) / 2];
}

function buildCountryNameIndex(
  boundaries: CountryBoundary[],
): Map<string, CountryBoundary> {
  const index = new Map<string, CountryBoundary>();
  for (const boundary of boundaries) {
    index.set(boundary.name.toLowerCase(), boundary);
  }
  return index;
}

type CountryRouteEntry = { routeId: string; position: MapPosition };

export function deriveRouteGeography(
  routes: RouteSummary[],
  countryBoundaries: CountryBoundary[],
): RouteGeography {
  const countryIndex = buildCountryNameIndex(countryBoundaries);
  const routeCountryIds = new Map<string, string>();
  const countryRouteMap = new Map<string, CountryRouteEntry[]>();
  const unknownRoutes: CountryRouteEntry[] = [];
  const UNKNOWN_ID = "__unknown__";

  for (const route of routes) {
    const position = routePosition(route);
    if (!position) continue;

    if (!route.countryName) {
      unknownRoutes.push({ routeId: route.routeId, position });
      continue;
    }

    const boundary = countryIndex.get(route.countryName.toLowerCase());
    if (!boundary) {
      unknownRoutes.push({ routeId: route.routeId, position });
      continue;
    }

    routeCountryIds.set(route.routeId, boundary.id);
    const entries = countryRouteMap.get(boundary.id) ?? [];
    entries.push({ routeId: route.routeId, position });
    countryRouteMap.set(boundary.id, entries);
  }

  const countries: GeographicArea[] = countryBoundaries.flatMap((country) => {
    const entries = countryRouteMap.get(country.id);
    if (!entries?.length) return [];
    return [{
      id: country.id,
      name: country.name,
      routeIds: entries.map((e) => e.routeId),
      center: areaCenter(entries.map((e) => e.position)),
      bounds: country.bounds,
    }];
  });

  if (unknownRoutes.length > 0) {
    for (const entry of unknownRoutes) {
      routeCountryIds.set(entry.routeId, UNKNOWN_ID);
    }
    countries.push({
      id: UNKNOWN_ID,
      name: "Unknown",
      routeIds: unknownRoutes.map((e) => e.routeId),
      center: areaCenter(unknownRoutes.map((e) => e.position)),
      bounds: boundsForArea(unknownRoutes.map((e) => e.position)),
    });
  }

  const citiesByCountryId = new Map<string, GeographicArea[]>();
  for (const country of countries) {
    const entries = countryRouteMap.get(country.id) ?? unknownRoutes;
    const cityGroups = new Map<string, CountryRouteEntry[]>();

    for (const entry of entries) {
      const route = routes.find((r) => r.routeId === entry.routeId);
      const cityKey = route?.cityName ?? "__unknown_city__";
      const group = cityGroups.get(cityKey) ?? [];
      group.push(entry);
      cityGroups.set(cityKey, group);
    }

    const cities: GeographicArea[] = Array.from(cityGroups, ([key, group]) => {
      const positions = group.map((e) => e.position);
      return {
        id: `${country.id}:${key}`,
        name: key === "__unknown_city__" ? "Unknown area" : key,
        routeIds: group.map((e) => e.routeId),
        center: areaCenter(positions),
        bounds: boundsForArea(positions),
      };
    }).sort((left, right) => left.name.localeCompare(right.name));

    citiesByCountryId.set(country.id, cities);
  }

  return { routeCountryIds, countries, citiesByCountryId };
}

export function countryFeaturesWithRouteCounts(
  countryBoundaries: CountryBoundary[],
  routeCountryIds: ReadonlyMap<string, string>,
  visibleRouteIds: ReadonlySet<string>,
): CountryFeatureCollection {
  const routeCounts = new Map<string, number>();
  for (const routeId of visibleRouteIds) {
    const countryId = routeCountryIds.get(routeId);
    if (countryId) routeCounts.set(countryId, (routeCounts.get(countryId) ?? 0) + 1);
  }

  return {
    type: "FeatureCollection",
    features: countryBoundaries.map((country) => ({
      type: "Feature",
      properties: {
        countryId: country.id,
        countryName: country.name,
        routeCount: routeCounts.get(country.id) ?? 0,
      },
      geometry: country.geometry,
    })),
  };
}

export function countryLabelFeatures(
  countryFeatures: CountryFeatureCollection,
): CountryLabelCollection {
  return {
    type: "FeatureCollection",
    features: countryFeatures.features.flatMap((feature) =>
      feature.properties.routeCount > 0
        ? [
            {
              type: "Feature",
              properties: feature.properties,
              geometry: { type: "Point", coordinates: labelPosition(feature.geometry) },
            },
          ]
        : [],
    ),
  };
}
