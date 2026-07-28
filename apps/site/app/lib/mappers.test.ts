import { describe, expect, it } from "vitest";

import { mapFitness, mapMapProfileRecord, mapRoute } from "./mappers";

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

  it("maps sampled profile geography and telemetry", () => {
    expect(
      mapMapProfileRecord({
        record_index: 42,
        record_distance_km: 10.2,
        altitude_m: 1_200,
        pace_min_per_km: 5.25,
        position_lat_deg: -15.4,
        position_long_deg: 28.3,
        heart_rate: 160,
      }),
    ).toEqual({
      recordIndex: 42,
      distanceKm: 10.2,
      altitudeM: 1_200,
      paceMinPerKm: 5.25,
      heartRate: 160,
      latitudeDeg: -15.4,
      longitudeDeg: 28.3,
    });
  });
});

describe("mapFitness", () => {
  it("maps the comparable recovery baseline fields", () => {
    expect(
      mapFitness({
        activity_id: "activity-1",
        activity_date: "2026-06-24",
        ending_heart_rate: "147",
        recovery_prior_90d_count: "6",
        recovery_prior_90d_median: "47",
        recovery_prior_90d_q1: "44",
        recovery_prior_90d_q3: "51",
        recovery_prior_90d_min: "37",
        recovery_prior_90d_max: "58",
      }),
    ).toMatchObject({
      endingHeartRate: 147,
      recoveryPrior90dCount: 6,
      recoveryPrior90dMedian: 47,
      recoveryPrior90dQ1: 44,
      recoveryPrior90dQ3: 51,
      recoveryPrior90dMin: 37,
      recoveryPrior90dMax: 58,
    });
  });
});
