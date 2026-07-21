import type { UnitSystem } from "./types";

export type DistanceUnit = "km" | "mi";
export type SegmentResolution = 0.25 | 0.5 | 1;

export const DISTANCE_UNIT_STORAGE_KEY = "running-signals-distance-unit";
export const SEGMENT_RESOLUTIONS: readonly SegmentResolution[] = [0.25, 0.5, 1];
export const MILES_PER_KILOMETER = 0.621371192237334;

const US_CUSTOMARY_REGIONS = new Set(["LR", "MM", "US"]);

export function isDistanceUnit(value: unknown): value is DistanceUnit {
  return value === "km" || value === "mi";
}

export function isSegmentResolution(value: unknown): value is SegmentResolution {
  return value === 0.25 || value === 0.5 || value === 1;
}

export function parseSegmentResolution(value: string | null): SegmentResolution | null {
  if (value === null) return null;
  const parsed = Number(value);
  return isSegmentResolution(parsed) ? parsed : null;
}

export function unitSystemFor(unit: DistanceUnit): UnitSystem {
  return unit === "mi" ? "imperial" : "metric";
}

export function distanceUnitFor(system: UnitSystem): DistanceUnit {
  return system === "imperial" ? "mi" : "km";
}

export function distanceFromKm(value: number, unit: DistanceUnit): number {
  return unit === "mi" ? value * MILES_PER_KILOMETER : value;
}

export function distanceToKm(value: number, unit: DistanceUnit): number {
  return unit === "mi" ? value / MILES_PER_KILOMETER : value;
}

export function paceFromMinPerKm(value: number, unit: DistanceUnit): number {
  return unit === "mi" ? value / MILES_PER_KILOMETER : value;
}

export function paceToMinPerKm(value: number, unit: DistanceUnit): number {
  return unit === "mi" ? value * MILES_PER_KILOMETER : value;
}

export function speedFromKmh(value: number, unit: DistanceUnit): number {
  return unit === "mi" ? value * MILES_PER_KILOMETER : value;
}

export function convertDistanceUnit(
  value: number,
  from: DistanceUnit,
  to: DistanceUnit,
): number {
  return distanceFromKm(distanceToKm(value, from), to);
}

export function convertPaceUnit(
  value: number,
  from: DistanceUnit,
  to: DistanceUnit,
): number {
  return paceFromMinPerKm(paceToMinPerKm(value, from), to);
}

export function distanceUnitFromLocales(locales: readonly string[]): DistanceUnit {
  for (const locale of locales) {
    const normalized = locale.split(";")[0]?.trim().replace("_", "-");
    if (!normalized) continue;

    try {
      const region = new Intl.Locale(normalized).region;
      if (region) return US_CUSTOMARY_REGIONS.has(region) ? "mi" : "km";
    } catch {
      continue;
    }
  }

  return "km";
}
