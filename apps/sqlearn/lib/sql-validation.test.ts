import { describe, expect, it } from "vitest";

import { validateReadQuery } from "./sql-validation";

describe("Sqlearn SQL validation", () => {
  it("accepts an approved bounded view query", () => {
    expect(validateReadQuery("SELECT activity_date FROM site_runs ORDER BY activity_date DESC LIMIT 20"))
      .toBe("SELECT activity_date FROM site_runs ORDER BY activity_date DESC LIMIT 20");
  });

  it("accepts read-only common table expressions", () => {
    expect(validateReadQuery("WITH recent AS (SELECT activity_date FROM site_runs) SELECT * FROM recent LIMIT 10"))
      .toContain("WITH recent");
  });

  it("accepts a bounded UNION query", () => {
    expect(validateReadQuery("SELECT activity_date FROM site_runs UNION SELECT calendar_date FROM site_days LIMIT 10"))
      .toContain("UNION");
  });

  it("rejects multiple statements", () => {
    expect(() => validateReadQuery("SELECT * FROM site_runs LIMIT 1; SELECT * FROM site_days LIMIT 1"))
      .toThrow("Only one SQL statement");
  });

  it("rejects writes", () => {
    expect(() => validateReadQuery("DELETE FROM site_runs"))
      .toThrow("Only SELECT queries");
  });

  it("rejects unapproved schemas", () => {
    expect(() => validateReadQuery("SELECT * FROM pg_catalog.pg_tables LIMIT 10"))
      .toThrow("approved Sqlearn views");
  });

  it("rejects direct public-schema access", () => {
    expect(() => validateReadQuery("SELECT * FROM public.site_runs_core LIMIT 10"))
      .toThrow("approved Sqlearn views");
  });

  it("rejects unbounded result sets", () => {
    expect(() => validateReadQuery("SELECT * FROM site_runs"))
      .toThrow("LIMIT 1000 or lower");
  });

  it("rejects dangerous functions", () => {
    expect(() => validateReadQuery("SELECT pg_sleep(1) FROM site_runs LIMIT 1"))
      .toThrow("not allowed");
  });
});
