export const RECOVERY_BASELINE_MIN_OBSERVATIONS = 4;
export const RECOVERY_PROVISIONAL_MAX_OBSERVATIONS = 5;
export const RECOVERY_TOLERANCE_BPM = 3;
export const RECOVERY_HISTORY_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

export type RecoveryTrendInput = {
  activityDate: string;
  activityDateTimestamp: number;
  garminRecoveryHr: number;
  endingHeartRate: number;
  recoveryPrior90dCount: number | null;
  recoveryPrior90dMedian: number | null;
  recoveryPrior90dQ1: number | null;
  recoveryPrior90dQ3: number | null;
  recoveryPrior90dMin: number | null;
  recoveryPrior90dMax: number | null;
};

export type RecoveryClassification = "better" | "typical" | "worse" | "unavailable";

export type RecoveryTrendPoint = RecoveryTrendInput & {
  recoveryClassification: RecoveryClassification;
  recoveryDelta: number | null;
  recoveryIqr: [number, number] | null;
  recoveryBaselineProvisional: boolean;
};

export function recoveryDateTimestamp(activityDate: string): number {
  return new Date(`${activityDate}T00:00:00Z`).getTime();
}

function validBaseline(point: RecoveryTrendInput): boolean {
  return point.recoveryPrior90dCount !== null
    && point.recoveryPrior90dCount >= RECOVERY_BASELINE_MIN_OBSERVATIONS
    && point.recoveryPrior90dMedian !== null;
}

export function classifyRecoveryPoint(point: RecoveryTrendInput): RecoveryClassification {
  if (!validBaseline(point) || point.recoveryPrior90dMedian === null) return "unavailable";

  const delta = point.garminRecoveryHr - point.recoveryPrior90dMedian;
  if (delta > RECOVERY_TOLERANCE_BPM) return "better";
  if (delta < -RECOVERY_TOLERANCE_BPM) return "worse";
  return "typical";
}

export function buildRecoveryTrendPoints(points: RecoveryTrendInput[]): RecoveryTrendPoint[] {
  return [...points]
    .sort((left, right) => left.activityDateTimestamp - right.activityDateTimestamp)
    .map((point) => {
      const hasValidBaseline = validBaseline(point);
      const median = hasValidBaseline ? point.recoveryPrior90dMedian : null;
      const q1 = hasValidBaseline ? point.recoveryPrior90dQ1 : null;
      const q3 = hasValidBaseline ? point.recoveryPrior90dQ3 : null;

      return {
        ...point,
        recoveryClassification: classifyRecoveryPoint(point),
        recoveryDelta: median === null ? null : point.garminRecoveryHr - median,
        recoveryIqr: q1 !== null && q3 !== null ? [q1, q3] : null,
        recoveryBaselineProvisional:
          hasValidBaseline
          && point.recoveryPrior90dCount !== null
          && point.recoveryPrior90dCount <= RECOVERY_PROVISIONAL_MAX_OBSERVATIONS,
      };
    });
}

export function getRecoveryPointsWithinDays(
  points: RecoveryTrendPoint[],
  days = RECOVERY_HISTORY_DAYS,
): RecoveryTrendPoint[] {
  const sorted = [...points].sort(
    (left, right) => left.activityDateTimestamp - right.activityDateTimestamp,
  );
  const latestTimestamp = sorted.at(-1)?.activityDateTimestamp;
  if (latestTimestamp === undefined) return [];

  return sorted.filter(
    (point) => point.activityDateTimestamp >= latestTimestamp - (days - 1) * DAY_MS,
  );
}

export type RecoveryTrendSummary = {
  baseline: number | null;
  baselineCount: number | null;
  provisional: boolean;
  daysSinceLastComparableRun: number | null;
};

export function getRecoveryTrendSummary(
  points: RecoveryTrendPoint[],
  latestObservedTimestamp: number | null,
): RecoveryTrendSummary {
  const latest = points.at(-1);
  if (!latest) {
    return {
      baseline: null,
      baselineCount: null,
      provisional: false,
      daysSinceLastComparableRun: null,
    };
  }

  return {
    baseline: latest.recoveryPrior90dMedian,
    baselineCount: latest.recoveryPrior90dCount,
    provisional: latest.recoveryBaselineProvisional,
    daysSinceLastComparableRun:
      latestObservedTimestamp === null
        ? null
        : Math.max(0, Math.round((latestObservedTimestamp - latest.activityDateTimestamp) / DAY_MS)),
  };
}
