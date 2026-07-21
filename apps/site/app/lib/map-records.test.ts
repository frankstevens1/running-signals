import { describe, expect, it } from "vitest";

import { MAX_MAP_PROFILE_RECORDS, sampleMapProfileRecords } from "./map-records";

describe("sampleMapProfileRecords", () => {
  it("caps records at 500 while preserving ordered endpoints", () => {
    const records = Array.from({ length: 1_001 }, (_, index) => ({
      recordIndex: index + 1,
      distanceKm: index / 100,
      altitudeM: index,
      latitudeDeg: -15 + index / 100_000,
      longitudeDeg: 28 + index / 100_000,
    }));

    const sampled = sampleMapProfileRecords(records);

    expect(sampled).toHaveLength(MAX_MAP_PROFILE_RECORDS);
    expect(sampled[0]).toEqual(records[0]);
    expect(sampled.at(-1)).toEqual(records.at(-1));
    expect(sampled.every((record, index) => index === 0 || record.recordIndex > sampled[index - 1].recordIndex)).toBe(true);
  });
});
