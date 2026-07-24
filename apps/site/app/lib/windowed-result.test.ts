import { describe, expect, it } from "vitest";

import type { ResolvedAnalyticsWindow } from "./analytics-window";
import type { DataResult } from "./types";
import { windowedResult } from "./windowed-result";

const resolvedWindow: ResolvedAnalyticsWindow = {
  state: { preset: "current-year", comparison: "auto" },
  primary: { from: "2026-01-01", to: "2026-07-24" },
  comparison: { from: "2025-01-01", to: "2025-07-24" },
  effectiveComparison: "previous-year",
};

function ok<T>(data: T): Promise<DataResult<T>> {
  return Promise.resolve({ status: "ok", data });
}

function err(message: string): Promise<DataResult<never>> {
  return Promise.resolve({ status: "error", message });
}

function notConfigured(message: string): Promise<DataResult<never>> {
  return Promise.resolve({ status: "not_configured", message });
}

describe("windowedResult", () => {
  it("returns primary and comparison data when both succeed", async () => {
    const result = await windowedResult(
      resolvedWindow,
      ok([1, 2]),
      ok([3, 4]),
    );

    expect(result).toEqual({
      status: "ok",
      data: {
        primary: [1, 2],
        comparison: [3, 4],
        comparisonError: null,
        window: resolvedWindow,
      },
    });
  });

  it("returns primary data with null comparison when comparison is absent", async () => {
    const result = await windowedResult(resolvedWindow, ok([1, 2]), null);

    expect(result).toEqual({
      status: "ok",
      data: {
        primary: [1, 2],
        comparison: null,
        comparisonError: null,
        window: resolvedWindow,
      },
    });
  });

  it("returns primary data and surfaces comparison errors instead of failing", async () => {
    const result = await windowedResult(
      resolvedWindow,
      ok([1, 2]),
      err("comparison timeout"),
    );

    expect(result).toEqual({
      status: "ok",
      data: {
        primary: [1, 2],
        comparison: null,
        comparisonError: "comparison timeout",
        window: resolvedWindow,
      },
    });
  });

  it("returns primary not_configured status when primary is not configured", async () => {
    const result = await windowedResult(
      resolvedWindow,
      notConfigured("Supabase missing"),
      ok([3, 4]),
    );

    expect(result).toEqual({
      status: "not_configured",
      message: "Supabase missing",
    });
  });

  it("returns primary error when primary fails", async () => {
    const result = await windowedResult(
      resolvedWindow,
      err("primary timeout"),
      ok([3, 4]),
    );

    expect(result).toEqual({
      status: "error",
      message: "primary timeout",
    });
  });

  it("treats not_configured comparison as null without an error", async () => {
    const result = await windowedResult(
      resolvedWindow,
      ok([1, 2]),
      notConfigured("Supabase missing"),
    );

    expect(result).toEqual({
      status: "ok",
      data: {
        primary: [1, 2],
        comparison: null,
        comparisonError: null,
        window: resolvedWindow,
      },
    });
  });
});
