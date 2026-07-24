import {
  amsterdamToday,
  isMalformedAnalyticsUrlState,
  parseAnalyticsWindowState,
  resolveAnalyticsWindow,
  serializeAnalyticsWindowState,
  withAnalyticsWindowState,
} from "./analytics-window";

import { describe, expect, it } from "vitest";

describe("analytics windows", () => {
  it("defaults to current year and automatically compares the prior year to date", () => {
    const result = resolveAnalyticsWindow(new URLSearchParams(), null, "2026-07-24");
    expect(result.primary).toEqual({ from: "2026-01-01", to: "2026-07-24" });
    expect(result.comparison).toEqual({ from: "2025-01-01", to: "2025-07-24" });
    expect(result.effectiveComparison).toBe("previous-year");
  });

  it("resolves rolling presets as inclusive periods with equal previous periods", () => {
    const result = resolveAnalyticsWindow(
      new URLSearchParams({ window: "last-4-weeks", comparison: "auto" }),
      null,
      "2026-07-24",
    );
    expect(result.primary).toEqual({ from: "2026-06-27", to: "2026-07-24" });
    expect(result.comparison).toEqual({ from: "2026-05-30", to: "2026-06-26" });
  });

  it("gives valid URL state precedence over a persisted cookie", () => {
    const cookie = serializeAnalyticsWindowState({ preset: "all-time", comparison: "none" });
    const result = resolveAnalyticsWindow(
      new URLSearchParams({ window: "previous-year", comparison: "previous-year" }),
      cookie,
      "2026-07-24",
    );
    expect(result.primary).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    expect(result.comparison).toEqual({ from: "2024-01-01", to: "2024-12-31" });
  });

  it("round-trips encoded custom cookie state and preserves unrelated URL parameters", () => {
    const state = {
      preset: "custom" as const,
      comparison: "previous-period" as const,
      customFrom: "2026-07-10",
      customTo: "2026-07-14",
    };
    expect(parseAnalyticsWindowState(encodeURIComponent(serializeAnalyticsWindowState(state))))
      .toEqual(state);
    const params = withAnalyticsWindowState(new URLSearchParams("routeId=r1&offset=50"), state);
    expect(params.get("routeId")).toBe("r1");
    expect(params.has("offset")).toBe(false);
    expect(resolveAnalyticsWindow(params, null, "2026-07-24").comparison)
      .toEqual({ from: "2026-07-05", to: "2026-07-09" });
  });

  it("uses Europe/Amsterdam when the UTC date differs", () => {
    expect(amsterdamToday(new Date("2025-12-31T23:30:00.000Z"))).toBe("2026-01-01");
  });

  it("detects malformed URL state without rejecting valid states", () => {
    expect(isMalformedAnalyticsUrlState(new URLSearchParams())).toBe(false);
    expect(isMalformedAnalyticsUrlState(new URLSearchParams({ window: "current-year" }))).toBe(false);
    expect(isMalformedAnalyticsUrlState(new URLSearchParams({ window: "invalid" }))).toBe(true);
    expect(
      isMalformedAnalyticsUrlState(new URLSearchParams({ window: "custom", windowFrom: "nope" })),
    ).toBe(true);
  });
});
