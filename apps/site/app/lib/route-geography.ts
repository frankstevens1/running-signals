import type { RouteGeometryRecord } from "@/app/lib/types";

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

function labelPosition(geometry: CountryGeometry): MapPosition {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const largestPolygon = polygons.reduce((largest, polygon) =>
    Math.abs(ringArea(polygon[0])) > Math.abs(ringArea(largest[0])) ? polygon : largest,
  );

  return ringCenter(largestPolygon[0]);
}

function pointInRing([longitude, latitude]: MapPosition, ring: MapPosition[]) {
  let inside = false;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [currentLongitude, currentLatitude] = ring[index];
    const [previousLongitude, previousLatitude] = ring[previous];
    const intersects =
      currentLatitude > latitude !== previousLatitude > latitude &&
      longitude <
        ((previousLongitude - currentLongitude) * (latitude - currentLatitude)) /
          (previousLatitude - currentLatitude) +
          currentLongitude;

    if (intersects) inside = !inside;
  }

  return inside;
}

function pointInPolygon(position: MapPosition, polygon: MapPosition[][]) {
  return pointInRing(position, polygon[0]) && !polygon.slice(1).some((ring) => pointInRing(position, ring));
}

function countryContainsPosition(country: CountryBoundary, position: MapPosition) {
  const [minLongitude, minLatitude, maxLongitude, maxLatitude] = country.bounds;
  if (
    position[0] < minLongitude ||
    position[0] > maxLongitude ||
    position[1] < minLatitude ||
    position[1] > maxLatitude
  ) {
    return false;
  }

  if (country.geometry.type === "Polygon") {
    return pointInPolygon(position, country.geometry.coordinates);
  }

  return country.geometry.coordinates.some((polygon) => pointInPolygon(position, polygon));
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

function routeCentroids(records: RouteGeometryRecord[]) {
  const totals = new Map<string, { longitude: number; latitude: number; count: number }>();

  for (const record of records) {
    if (
      record.longitudeDeg === null ||
      record.latitudeDeg === null ||
      record.longitudeDeg < -180 ||
      record.longitudeDeg > 180 ||
      record.latitudeDeg < -90 ||
      record.latitudeDeg > 90
    ) {
      continue;
    }

    const current = totals.get(record.routeId) ?? { longitude: 0, latitude: 0, count: 0 };
    current.longitude += record.longitudeDeg;
    current.latitude += record.latitudeDeg;
    current.count += 1;
    totals.set(record.routeId, current);
  }

  return new Map(
    Array.from(totals, ([routeId, total]) => [
      routeId,
      [total.longitude / total.count, total.latitude / total.count] as MapPosition,
    ]),
  );
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

function coordinateLabel(value: number, positive: string, negative: string) {
  return `${Math.abs(value).toFixed(2)}°${value >= 0 ? positive : negative}`;
}

function cityName(center: MapPosition) {
  return `Area near ${coordinateLabel(center[1], "N", "S")}, ${coordinateLabel(center[0], "E", "W")}`;
}

export function deriveRouteGeography(
  records: RouteGeometryRecord[],
  countryBoundaries: CountryBoundary[],
): RouteGeography {
  const routeCountryIds = new Map<string, string>();
  const countryRoutes = new Map<string, Array<{ routeId: string; position: MapPosition }>>();

  for (const [routeId, position] of routeCentroids(records)) {
    const country = countryBoundaries.find((boundary) => countryContainsPosition(boundary, position));
    if (!country) continue;

    routeCountryIds.set(routeId, country.id);
    const routes = countryRoutes.get(country.id) ?? [];
    routes.push({ routeId, position });
    countryRoutes.set(country.id, routes);
  }

  const countries = countryBoundaries.flatMap((country) => {
    const routes = countryRoutes.get(country.id);
    if (!routes?.length) return [];

    return [
      {
        id: country.id,
        name: country.name,
        routeIds: routes.map((route) => route.routeId),
        center: areaCenter(routes.map((route) => route.position)),
        bounds: country.bounds,
      },
    ];
  });

  const citiesByCountryId = new Map<string, GeographicArea[]>();
  for (const country of countries) {
    const cityGroups = new Map<string, Array<{ routeId: string; position: MapPosition }>>();
    const routes = countryRoutes.get(country.id) ?? [];

    for (const route of routes) {
      const longitudeBucket = Math.floor(route.position[0] / 0.25);
      const latitudeBucket = Math.floor(route.position[1] / 0.25);
      const key = `${longitudeBucket}:${latitudeBucket}`;
      const group = cityGroups.get(key) ?? [];
      group.push(route);
      cityGroups.set(key, group);
    }

    const cities = Array.from(cityGroups, ([key, group]) => {
      const positions = group.map((route) => route.position);
      const center = areaCenter(positions);
      return {
        id: `${country.id}:${key}`,
        name: cityName(center),
        routeIds: group.map((route) => route.routeId),
        center,
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
