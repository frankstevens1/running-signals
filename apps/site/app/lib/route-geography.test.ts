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
): RouteSummary {
  return {
    routeId,
    firstObservedActivityDate: null,
    latestObservedActivityDate: null,
    runCount: 1,
    avgDistanceKm: null,
    minDistanceKm: null,
    maxDistanceKm: null,
    avgDurationSeconds: null,
    avgPaceMinPerKm: null,
    avgHeartRate: null,
    avgTotalAscent: null,
    avgTotalDescent: null,
    avgSegmentGrade: null,
    avgRouteAltitudeRangeM: null,
    routeDistanceBucketKm: null,
    cityGridBucket: null,
    representativeRouteCentroidLatitudeDeg: latitude,
    representativeRouteCentroidLongitudeDeg: longitude,
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
  ],
});

describe("route geography", () => {
  it("assigns route centroids to countries and groups nearby routes into city choices", () => {
    const geography = deriveRouteGeography(
      [
        routeSummary("route-north-1", 1, 1),
        routeSummary("route-north-2", 1.1, 1.1),
        routeSummary("route-south", 11, 11),
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
        routeSummary("route-north", 1, 1),
        routeSummary("route-south", 11, 11),
      ],
      countryBoundaries,
    );

    const features = countryFeaturesWithRouteCounts(
      countryBoundaries,
      geography.routeCountryIds,
      new Set(["route-south"]),
    );

    expect(features.features.map((feature) => feature.properties.routeCount)).toEqual([0, 1]);
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
