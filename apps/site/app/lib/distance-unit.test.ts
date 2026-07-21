import { describe, expect, it } from "vitest";

import {
  convertDistanceUnit,
  convertPaceUnit,
  distanceFromKm,
  distanceToKm,
  distanceUnitFromLocales,
  isDistanceUnit,
  parseSegmentResolution,
  paceFromMinPerKm,
  paceToMinPerKm,
  speedFromKmh,
  unitSystemFor,
} from "./distance-unit";

describe("distance units", () => {
  it("converts distance, pace, and speed without changing the physical value", () => {
    expect(distanceFromKm(10, "mi")).toBeCloseTo(6.2137119);
    expect(distanceToKm(distanceFromKm(10, "mi"), "mi")).toBeCloseTo(10);
    expect(paceFromMinPerKm(5, "mi")).toBeCloseTo(8.04672);
    expect(paceToMinPerKm(paceFromMinPerKm(5, "mi"), "mi")).toBeCloseTo(5);
    expect(speedFromKmh(10, "mi")).toBeCloseTo(6.2137119);
    expect(convertDistanceUnit(5, "km", "mi")).toBeCloseTo(3.106856);
    expect(convertPaceUnit(8, "mi", "km")).toBeCloseTo(4.97097);
  });

  it("derives the initial unit from the first usable browser locale", () => {
    expect(distanceUnitFromLocales(["en-US", "en"])).toBe("mi");
    expect(distanceUnitFromLocales(["en-GB", "en"])).toBe("km");
    expect(distanceUnitFromLocales(["invalid_locale", "en-US"])).toBe("mi");
    expect(distanceUnitFromLocales([])).toBe("km");
  });

  it("validates public unit and split-resolution parameters", () => {
    expect(isDistanceUnit("km")).toBe(true);
    expect(isDistanceUnit("mi")).toBe(true);
    expect(isDistanceUnit("miles")).toBe(false);
    expect(parseSegmentResolution("0.25")).toBe(0.25);
    expect(parseSegmentResolution("0.5")).toBe(0.5);
    expect(parseSegmentResolution("1")).toBe(1);
    expect(parseSegmentResolution("2")).toBeNull();
    expect(unitSystemFor("km")).toBe("metric");
    expect(unitSystemFor("mi")).toBe("imperial");
  });
});
