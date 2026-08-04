import { describe, expect, it } from "vitest";

import { formatSnapshotFreshness, formatSyncDate } from "./format";

describe("formatSyncDate", () => {
  it("renders published snapshot times in UTC", () => {
    expect(formatSyncDate("2026-08-04T12:00:00+02:00")).toBe("Aug 4, 2026, 10:00 AM UTC");
  });
});

describe("formatSnapshotFreshness", () => {
  const now = new Date("2026-08-04T12:00:00Z");

  it("renders factual UTC snapshot ages", () => {
    expect(formatSnapshotFreshness("2026-08-04T00:01:00Z", now)).toBe("synced today");
    expect(formatSnapshotFreshness("2026-08-03T23:59:00Z", now)).toBe("synced yesterday");
    expect(formatSnapshotFreshness("2026-08-01T12:00:00Z", now)).toBe("synced 3 days ago");
  });

  it("handles unavailable timestamps", () => {
    expect(formatSnapshotFreshness(null, now)).toBe("sync time unavailable");
    expect(formatSnapshotFreshness("not-a-date", now)).toBe("sync time unavailable");
  });
});
