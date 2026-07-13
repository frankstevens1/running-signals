import { describe, expect, it } from "vitest";

import {
  countryBoundariesFromGeoJson,
  countryLabelFeatures,
  countryFeaturesWithRouteCounts,
  deriveRouteGeography,
} from "./route-geography";

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
        {
          routeId: "route-north-1",
          runId: "run-1",
          recordIndex: 1,
          latitudeDeg: 1,
          longitudeDeg: 1,
        },
        {
          routeId: "route-north-2",
          runId: "run-2",
          recordIndex: 1,
          latitudeDeg: 1.1,
          longitudeDeg: 1.1,
        },
        {
          routeId: "route-south",
          runId: "run-3",
          recordIndex: 1,
          latitudeDeg: 11,
          longitudeDeg: 11,
        },
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
        {
          routeId: "route-north",
          runId: "run-1",
          recordIndex: 1,
          latitudeDeg: 1,
          longitudeDeg: 1,
        },
        {
          routeId: "route-south",
          runId: "run-2",
          recordIndex: 1,
          latitudeDeg: 11,
          longitudeDeg: 11,
        },
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
