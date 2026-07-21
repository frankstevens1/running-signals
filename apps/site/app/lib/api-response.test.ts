import { describe, expect, it } from "vitest";

import { jsonResult, PUBLIC_READ_CACHE_CONTROL } from "./api-response";

describe("jsonResult", () => {
  it("caches successful public read responses", () => {
    const response = jsonResult({ status: "ok", data: { routeId: "route-1" } });

    expect(response.headers.get("Cache-Control")).toBe(PUBLIC_READ_CACHE_CONTROL);
  });

  it("does not cache error responses", () => {
    const response = jsonResult({ status: "error", message: "Unavailable" });

    expect(response.status).toBe(500);
    expect(response.headers.has("Cache-Control")).toBe(false);
  });
});
