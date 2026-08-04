import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/lib/data", () => ({
  getLandingStatus: vi.fn(async () => ({
    status: "ok",
    data: {
      latestCompletedDate: "2026-08-04",
      lastSyncDate: "2026-08-04T12:00:00+00:00",
      statusLabel: "Published FIT data available",
    },
  })),
}));

import { GET } from "./route";

describe("GET /api/status", () => {
  it("does not serve a stale published snapshot from HTTP caches", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
