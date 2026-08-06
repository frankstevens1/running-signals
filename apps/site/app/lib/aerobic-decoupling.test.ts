import { describe, expect, it } from "vitest";

import {
  aerobicDecouplingCallout,
  aerobicDecouplingLabel,
  aerobicDecouplingLevel,
  aerobicDecouplingUnavailableReason,
} from "./aerobic-decoupling";

describe("aerobic decoupling", () => {
  it("classifies the established decoupling thresholds", () => {
    expect(aerobicDecouplingLevel(0.05)).toBe("low");
    expect(aerobicDecouplingLevel(0.051)).toBe("moderate");
    expect(aerobicDecouplingLevel(0.101)).toBe("high");
    expect(aerobicDecouplingLabel(0.1)).toBe("Moderate decoupling");
  });

  it("explains eligible and unavailable readings", () => {
    expect(aerobicDecouplingCallout(0)).toBe("Stable across both halves");
    expect(aerobicDecouplingUnavailableReason("insufficient_valid_segments"))
      .toBe("Fewer than 8 valid 250 m segments.");
  });
});
