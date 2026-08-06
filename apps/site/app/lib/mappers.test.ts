import { describe, expect, it } from "vitest";

import { mapFitness, mapMapProfileRecord, mapRoute, mapRun } from "./mappers";

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

  it("maps aerobic decoupling evidence and rejects unknown statuses", () => {
    expect(
      mapFitness({
        aerobic_decoupling_pct: "0.0625",
        aerobic_decoupling_status: "eligible",
        aerobic_decoupling_moving_duration_seconds: "1560",
        aerobic_decoupling_valid_segment_count: "12",
        aerobic_decoupling_hr_coverage_ratio: "0.92",
        aerobic_decoupling_prior_90d_count: "5",
        aerobic_decoupling_prior_90d_median: "0.04",
      }),
    ).toMatchObject({
      aerobicDecouplingPct: 0.0625,
      aerobicDecouplingStatus: "eligible",
      aerobicDecouplingMovingDurationSeconds: 1560,
      aerobicDecouplingValidSegmentCount: 12,
      aerobicDecouplingHrCoverageRatio: 0.92,
      aerobicDecouplingPrior90dCount: 5,
      aerobicDecouplingPrior90dMedian: 0.04,
    });
    expect(mapFitness({ aerobic_decoupling_status: "unknown" }).aerobicDecouplingStatus).toBeNull();
  });
});

describe("mapRun", () => {
  it("maps aerobic decoupling states exposed by the run view", () => {
    expect(
      mapRun({
        aerobic_decoupling_pct: "0.0625",
        aerobic_decoupling_status: "eligible",
        aerobic_decoupling_failed_gates: "[]",
        previous_aerobic_decoupling_pct: "0.045",
        previous_distance_economy_m_per_beat: "0.123",
        previous_elevation_economy_m_per_beat: "0.0045",
        previous_prior_7d_distance_km: "42.5",
      }),
    ).toMatchObject({
      aerobicDecouplingPct: 0.0625,
      aerobicDecouplingStatus: "eligible",
      aerobicDecouplingUnavailableReason: null,
      aerobicDecouplingFailedGates: [],
      previousAerobicDecouplingPct: 0.045,
      previousDistanceEconomyMperBeat: 0.123,
      previousElevationEconomyMperBeat: 0.0045,
      previousPrior7dDistanceKm: 42.5,
    });

    expect(
      mapRun({
        aerobic_decoupling_status: "ineligible",
        aerobic_decoupling_unavailable_reason: "insufficient_valid_segments",
        aerobic_decoupling_failed_gates: [{
          code: "insufficient_valid_segments",
          observed: "6 valid 250 m HR segments",
          required: "at least 8 segments",
        }],
      }),
    ).toMatchObject({
      aerobicDecouplingPct: null,
      aerobicDecouplingStatus: "ineligible",
      aerobicDecouplingUnavailableReason: "insufficient_valid_segments",
      aerobicDecouplingFailedGates: [{
        code: "insufficient_valid_segments",
        observed: "6 valid 250 m HR segments",
        required: "at least 8 segments",
      }],
    });

    expect(mapRun({ aerobic_decoupling_status: "unknown" }).aerobicDecouplingStatus).toBeNull();
    expect(mapRun({ aerobic_decoupling_failed_gates: "not valid JSON" }).aerobicDecouplingFailedGates)
      .toEqual([]);
  });
});
