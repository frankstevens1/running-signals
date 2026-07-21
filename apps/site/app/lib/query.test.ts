import { describe, expect, it } from "vitest";

import { MILES_PER_KILOMETER } from "./distance-unit";
import { parseRunFilters } from "./query";

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
