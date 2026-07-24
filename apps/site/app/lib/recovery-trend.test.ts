import { describe, expect, it } from "vitest";

import {
  buildRecoveryTrendPoints,
  getRecoveryPointsWithinDays,
  getRecoveryTrendSummary,
  recoveryDateTimestamp,
  type RecoveryTrendInput,
} from "./recovery-trend";

function point(
  activityDate: string,
  garminRecoveryHr: number,
  overrides: Partial<RecoveryTrendInput> = {},
): RecoveryTrendInput {
  return {
    activityDate,
    activityDateTimestamp: recoveryDateTimestamp(activityDate),
    garminRecoveryHr,
    endingHeartRate: 147,
    recoveryPrior90dCount: 4,
    recoveryPrior90dMedian: 47,
    recoveryPrior90dQ1: 44,
    recoveryPrior90dQ3: 51,
    recoveryPrior90dMin: 37,
    recoveryPrior90dMax: 58,
    ...overrides,
  };
}

describe("recovery trend presentation", () => {
  it("uses the prior baseline with a neutral tolerance zone", () => {
    const trend = buildRecoveryTrendPoints([
      point("2026-06-01", 51),
      point("2026-06-02", 50),
      point("2026-06-03", 43),
      point("2026-06-04", 55, { recoveryPrior90dCount: 3 }),
    ]);

    expect(trend.map((item) => item.recoveryClassification))
      .toEqual(["better", "typical", "worse", "unavailable"]);
    expect(trend[0]?.recoveryDelta).toBe(4);
    expect(trend[0]?.recoveryIqr).toEqual([44, 51]);
    expect(trend[3]?.recoveryIqr).toBeNull();
  });

  it("keeps comparable readings inside the requested trailing window", () => {
    const trend = buildRecoveryTrendPoints([
      point("2026-05-01", 48),
      point("2026-06-10", 49),
      point("2026-06-26", 50),
      point("2026-06-28", 51, { recoveryPrior90dCount: 3, recoveryPrior90dMedian: null }),
      point("2026-06-29", 52),
    ]);

    expect(getRecoveryPointsWithinDays(trend, 21).map((item) => item.activityDate))
      .toEqual(["2026-06-10", "2026-06-26", "2026-06-28", "2026-06-29"]);
  });

  it("reports the latest baseline and staleness", () => {
    const trend = buildRecoveryTrendPoints([
      point("2026-05-01", 48, { recoveryPrior90dMedian: 48 }),
      point("2026-05-30", 55, { recoveryPrior90dMedian: 55, recoveryPrior90dCount: 6 }),
    ]);

    expect(getRecoveryTrendSummary(trend, recoveryDateTimestamp("2026-06-02"))).toEqual({
      baseline: 55,
      baselineCount: 6,
      provisional: false,
      daysSinceLastComparableRun: 3,
    });
  });
});
