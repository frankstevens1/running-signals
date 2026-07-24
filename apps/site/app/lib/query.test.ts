import { describe, expect, it } from "vitest";

import { MILES_PER_KILOMETER } from "./distance-unit";
import {
  isStrictOffset,
  isStrictPositiveInt,
  parseOffset,
  parseOptionalDate,
  parsePositiveInt,
  parseRunFilters,
} from "./query";

describe("run filter measurements", () => {
  it("converts mile-denominated distance and pace inputs to canonical metric values", () => {
    const filters = parseRunFilters(
      new URLSearchParams({
        minDistance: "3.1",
        maxDistance: "6.2",
        minPace: "8",
        maxPace: "9",
      }),
      "mi",
    );

    expect(filters.minDistanceKm).toBeCloseTo(3.1 / MILES_PER_KILOMETER);
    expect(filters.maxDistanceKm).toBeCloseTo(6.2 / MILES_PER_KILOMETER);
    expect(filters.minPace).toBeCloseTo(8 * MILES_PER_KILOMETER);
    expect(filters.maxPace).toBeCloseTo(9 * MILES_PER_KILOMETER);
  });

  it("leaves kilometre-denominated inputs unchanged", () => {
    const filters = parseRunFilters(
      new URLSearchParams({ minDistance: "5", minPace: "4.5" }),
      "km",
    );

    expect(filters.minDistanceKm).toBe(5);
    expect(filters.minPace).toBe(4.5);
  });

  it("preserves legacy canonical kilometre filter parameters", () => {
    const filters = parseRunFilters(
      new URLSearchParams({ minDistanceKm: "5", maxDistanceKm: "10" }),
      "mi",
    );

    expect(filters.minDistanceKm).toBe(5);
    expect(filters.maxDistanceKm).toBe(10);
  });
});

describe("strict query parsing", () => {
  it("rejects partial, signed, zero, and out-of-range limits", () => {
    expect(parsePositiveInt("25rows", 10, 100)).toBe(10);
    expect(parsePositiveInt("0", 10, 100)).toBe(10);
    expect(parsePositiveInt("-2", 10, 100)).toBe(10);
    expect(isStrictPositiveInt("101", 100)).toBe(false);
    expect(isStrictPositiveInt("100", 100)).toBe(true);
  });

  it("accepts zero only for offsets and rejects partial values", () => {
    expect(parseOffset("0")).toBe(0);
    expect(parseOffset("12x", 7)).toBe(7);
    expect(isStrictOffset("0")).toBe(true);
    expect(isStrictOffset("-1")).toBe(false);
  });

  it("validates calendar dates rather than only their shape", () => {
    expect(parseOptionalDate("2024-02-29")).toBe("2024-02-29");
    expect(parseOptionalDate("2025-02-29")).toBeUndefined();
    expect(parseOptionalDate("2026-13-01")).toBeUndefined();
  });
});
