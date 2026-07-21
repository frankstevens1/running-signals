import { describe, expect, it } from "vitest";

import { shouldRequestRouteRecords } from "./route-records-client";

describe("route record selection", () => {
  it("does not request geometry until a route is selected", () => {
    expect(shouldRequestRouteRecords(null, false)).toBe(false);
    expect(shouldRequestRouteRecords("route-1", false)).toBe(true);
    expect(shouldRequestRouteRecords("route-1", true)).toBe(false);
  });
});
