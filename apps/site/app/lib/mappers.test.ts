import { describe, expect, it } from "vitest";

import { mapMapProfileRecord, mapRoute } from "./mappers";

describe("mapRoute", () => {
  it("maps nullable representative route centroids", () => {
    const route = mapRoute({
      route_id: "route-1",
      representative_route_centroid_latitude_deg: "-15.4167",
      representative_route_centroid_longitude_deg: "28.2833",
    });

    expect(route.representativeRouteCentroidLatitudeDeg).toBe(-15.4167);
    expect(route.representativeRouteCentroidLongitudeDeg).toBe(28.2833);
  });

  it("keeps map/profile responses to the five fields used by map and elevation UI", () => {
    expect(
      mapMapProfileRecord({
        record_index: 42,
        record_distance_km: 10.2,
        altitude_m: 1_200,
        position_lat_deg: -15.4,
        position_long_deg: 28.3,
        heart_rate: 160,
      }),
    ).toEqual({
      recordIndex: 42,
      distanceKm: 10.2,
      altitudeM: 1_200,
      latitudeDeg: -15.4,
      longitudeDeg: 28.3,
    });
  });
});
