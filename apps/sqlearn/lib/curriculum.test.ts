import { describe, expect, it } from "vitest";

import { getExerciseContent, getSolutionContent } from "./curriculum";

describe("Sqlearn curriculum access", () => {
  it("loads a known exercise", () => {
    expect(getExerciseContent("01-select-basics", "01-easy")).toContain("TASK");
  });

  it("rejects traversal-like exercise identifiers", () => {
    expect(getExerciseContent("01-select-basics", "../../.env")).toBeNull();
  });

  it("rejects traversal-like solution identifiers", () => {
    expect(getSolutionContent("01-select-basics", "../../..", ".env")).toBeNull();
  });
});
