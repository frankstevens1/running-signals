import { describe, expect, it } from "vitest";

import { RUN_TABLE_SORT_OPTIONS, getRunSortState, hrefWithRunSort } from "./run-sort";

describe("run sort helpers", () => {
  it("resets pagination while preserving unrelated query state", () => {
    const params = new URLSearchParams(
      "view=timeline&limit=50&offset=100&dateFrom=2026-01-01&window=last-12-weeks",
    );
    const href = hrefWithRunSort(params, "avg_pace_min_per_km", "asc");
    const next = new URL(href, "https://running-signals.invalid").searchParams;

    expect(next.get("sort")).toBe("avg_pace_min_per_km");
    expect(next.get("direction")).toBe("asc");
    expect(next.has("offset")).toBe(false);
    expect(next.get("view")).toBe("timeline");
    expect(next.get("limit")).toBe("50");
    expect(next.get("dateFrom")).toBe("2026-01-01");
    expect(next.get("window")).toBe("last-12-weeks");
  });

  it("uses the table defaults for every timeline sort option", () => {
    for (const option of RUN_TABLE_SORT_OPTIONS) {
      const href = hrefWithRunSort(new URLSearchParams("offset=25"), option.sort, option.defaultDirection);
      const next = new URL(href, "https://running-signals.invalid").searchParams;

      expect(next.get("sort")).toBe(option.sort);
      expect(next.get("direction")).toBe(option.defaultDirection);
      expect(next.has("offset")).toBe(false);
    }
  });

  it("changes direction without changing the selected sort or other query state", () => {
    const params = new URLSearchParams(
      "view=timeline&limit=50&offset=100&sort=distance_km&direction=desc&routeId=route-1",
    );
    const href = hrefWithRunSort(params, "distance_km", "asc");
    const next = new URL(href, "https://running-signals.invalid").searchParams;

    expect(next.get("sort")).toBe("distance_km");
    expect(next.get("direction")).toBe("asc");
    expect(next.get("view")).toBe("timeline");
    expect(next.get("limit")).toBe("50");
    expect(next.get("routeId")).toBe("route-1");
    expect(next.has("offset")).toBe(false);
  });

  it("matches the table header active and direction-toggle state", () => {
    const defaultDate = RUN_TABLE_SORT_OPTIONS[0];
    const active = getRunSortState(
      new URLSearchParams("sort=activity_date&direction=desc"),
      defaultDate.sort,
      defaultDate.defaultDirection,
    );
    const inactive = getRunSortState(
      new URLSearchParams("sort=distance_km&direction=desc"),
      defaultDate.sort,
      defaultDate.defaultDirection,
    );

    expect(active).toMatchObject({ active: true, direction: "desc", nextDirection: "asc" });
    expect(inactive).toMatchObject({ active: false, direction: "desc", nextDirection: "desc" });
  });
});
