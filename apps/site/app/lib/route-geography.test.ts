import { describe, expect, it } from "vitest";

import {
  countryBoundariesFromGeoJson,
  countryLabelFeatures,
  countryFeaturesWithRouteCounts,
  deriveRouteGeography,
} from "./route-geography";
import type { RouteSummary } from "./types";

function routeSummary(
  routeId: string,
  latitude: number | null,
  longitude: number | null,
  countryName: string | null = null,
  cityName: string | null = null,
  countryIso3: string | null = null,
): RouteSummary {
  return {
    routeId,
    latestObservedActivityDate: null,
    runCount: 1,
    avgDistanceKm: null,
    avgPaceMinPerKm: null,
    avgHeartRate: null,
    representativeRouteCentroidLatitudeDeg: latitude,
    representativeRouteCentroidLongitudeDeg: longitude,
    countryName,
    countryCode: null,
    countryIso3,
    cityName,
  };
}

const countryBoundaries = countryBoundariesFromGeoJson({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "north",
      properties: { name: "Northland" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [5, 0],
            [5, 5],
            [0, 5],
            [0, 0],
          ],
        ],
      },
    },
    {
      type: "Feature",
      id: "south",
      properties: { name: "Southland" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [10, 10],
            [15, 10],
            [15, 15],
            [10, 15],
            [10, 10],
          ],
        ],
      },
    },
    {
      type: "Feature",
      id: "USA",
      properties: { name: "United States of America" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [20, 20],
            [25, 20],
            [25, 25],
            [20, 25],
            [20, 20],
          ],
        ],
      },
    },
  ],
});

describe("route geography", () => {
  it("assigns routes to countries by name and groups by city_name", () => {
    const geography = deriveRouteGeography(
      [
        routeSummary("route-north-1", 1, 1, "Northland", "Northville"),
        routeSummary("route-north-2", 1.1, 1.1, "Northland", "Northville"),
        routeSummary("route-south", 11, 11, "Southland", "Southburg"),
      ],
      countryBoundaries,
    );

    expect(geography.routeCountryIds.get("route-north-1")).toBe("north");
    expect(geography.routeCountryIds.get("route-south")).toBe("south");
    expect(geography.countries.map((country) => country.name)).toEqual(["Northland", "Southland"]);
    expect(geography.citiesByCountryId.get("north")?.[0]?.routeIds).toEqual([
      "route-north-1",
      "route-north-2",
    ]);
  });

  it("adds counts for only the routes currently visible on the map", () => {
    const geography = deriveRouteGeography(
      [
        routeSummary("route-north", 1, 1, "Northland", "Northville"),
        routeSummary("route-south", 11, 11, "Southland", "Southburg"),
      ],
      countryBoundaries,
    );

    const features = countryFeaturesWithRouteCounts(
      countryBoundaries,
      geography.routeCountryIds,
      new Set(["route-south"]),
    );

    expect(features.features.map((feature) => feature.properties.routeCount)).toEqual([0, 1, 0]);
  });

  it("uses ISO-3 identity before country display names", () => {
    const geography = deriveRouteGeography(
      [routeSummary("route-us", 21, 21, "United States", "Somewhere", "USA")],
      countryBoundaries,
    );

    expect(geography.routeCountryIds.get("route-us")).toBe("USA");
    expect(geography.countries).toContainEqual(expect.objectContaining({
      id: "USA",
      name: "United States of America",
    }));
  });

  it("trims country names for pre-ISO-3 route data", () => {
    const geography = deriveRouteGeography(
      [routeSummary("route-north", 1, 1, " Northland ")],
      countryBoundaries,
    );

    expect(geography.routeCountryIds.get("route-north")).toBe("north");
  });

  it("creates one country label for a multi-polygon country", () => {
    const labels = countryLabelFeatures({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { countryId: "islands", countryName: "Islands", routeCount: 2 },
          geometry: {
            type: "MultiPolygon",
            coordinates: [
              [
                [
                  [0, 0],
                  [4, 0],
                  [4, 4],
                  [0, 4],
                  [0, 0],
                ],
              ],
              [
                [
                  [10, 10],
                  [11, 10],
                  [11, 11],
                  [10, 11],
                  [10, 10],
                ],
              ],
            ],
          },
        },
      ],
    });

    expect(labels.features).toHaveLength(1);
    expect(labels.features[0].geometry.coordinates).toEqual([2, 2]);
  });
});
