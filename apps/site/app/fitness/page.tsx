import { Activity, ArrowRight, Gauge, HeartPulse, Mountain, Sparkles } from "lucide-react";

import { AppShell } from "@/app/components/app-shell";
import { DataState } from "@/app/components/data-state";
import { MetricCard } from "@/app/components/metric-card";
import { ScrollReveal } from "@/app/components/motion-reveal";
import { SectionHeading } from "@/app/components/section-heading";
import {
  DistanceEconomyChart,
  EfficiencyScoreChart,
  ElevationEconomyChart,
  FitnessEfficiencyChart,
  HrDriftChart,
  PaceHeartRateTrend,
  RecoveryHeartRateChart,
} from "@/app/components/trend-charts";
import { getFitness } from "@/app/lib/data";
import { speedFromKmh } from "@/app/lib/distance-unit";
import {
  formatDate,
  formatDecimal2,
  formatHeartRate,
  formatInteger,
} from "@/app/lib/format";
import { explorerPages } from "@/app/lib/page-metadata";
import { getServerDistanceUnit } from "@/app/lib/server-distance-unit";
import { getServerAnalyticsWindow } from "@/app/lib/analytics-window-server";
import { comparisonTrendLabel } from "@/app/lib/analytics-window";
import { RECOVERY_BASELINE_MIN_OBSERVATIONS } from "@/app/lib/recovery-trend";

function trendDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
): { direction: "up" | "down" | "neutral"; diff: number } | null {
  if (current == null || previous == null) return null;
  const diff = current - previous;
  const direction =
    diff > 0 ? ("up" as const) : diff < 0 ? ("down" as const) : ("neutral" as const);
  return { direction, diff };
}

function formatFixedSignedPercent(
  value: number | null | undefined,
  spaceBeforeUnit = true,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return `${value > 0 ? "+" : ""}${formatDecimal2(value * 100)}${spaceBeforeUnit ? " " : ""}%`;
}

function relativeTrend(
  current: number | null | undefined,
  baseline: number | null | undefined,
): { direction: "up" | "down" | "neutral"; change: number } | null {
  if (baseline === null || baseline === undefined || baseline === 0) return null;
  const delta = trendDelta(current, baseline);
  if (!delta) return null;
  return { direction: delta.direction, change: delta.diff / baseline };
}

export default async function FitnessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = await searchParams;
  const analyticsWindow = await getServerAnalyticsWindow(resolved);
  const { effectiveComparison } = analyticsWindow;
  const [fitness, comparisonFitness, unit] = await Promise.all([
    getFitness(analyticsWindow.primary),
    analyticsWindow.comparison ? getFitness(analyticsWindow.comparison) : null,
    getServerDistanceUnit(),
  ]);

  return (
    <AppShell>
      <div className="space-y-10">
        <SectionHeading
          eyebrow="mart_fitness"
          title="Descriptive fitness trends"
          description="Fitness views stay descriptive: heart-rate drift over time, pace at comparable heart rate, speed per heartbeat, and post-run recovery HR."
          icon={explorerPages.fitness.icon}
        />
        <DataState result={fitness}>
          {(data) => {
            const comparison = comparisonFitness?.status === "ok" ? comparisonFitness.data : null;
            const latest = data.at(-1);
            const penultimate = data.at(-2);
            const latestRecovery = [...data]
              .reverse()
              .find((point) => point.garminRecoveryHr !== null);
            const comparisonEfficiencies = comparison
              ?.map((point) => point.efficiencyRatio)
              .filter((value): value is number => value !== null) ?? [];
            const comparisonEfficiency = comparisonEfficiencies.length > 0
              ? comparisonEfficiencies.reduce((sum, value) => sum + value, 0)
                / comparisonEfficiencies.length
              : null;

            const driftTrend = trendDelta(
              latest?.hrDriftPct,
              latest?.rolling4RunHrDriftPct,
            );

            const hrTrend =
              latest && penultimate
                ? trendDelta(latest.avgHeartRate, penultimate.avgHeartRate)
                : null;

            const recoveryTrend = trendDelta(
              latestRecovery?.garminRecoveryHr,
              latestRecovery?.recoveryPrior90dCount != null
                && latestRecovery.recoveryPrior90dCount >= RECOVERY_BASELINE_MIN_OBSERVATIONS
                ? latestRecovery.recoveryPrior90dMedian
                : null,
            );

            const efficiencyBaseline = comparisonEfficiency ?? latest?.rolling4RunEfficiencyRatio;
            const efficiencyTrend = relativeTrend(
              latest?.efficiencyRatio,
              efficiencyBaseline,
            );

            const economyValues = data
              .filter((p) => p.distanceEconomyMperBeat !== null)
              .map((p) => p.distanceEconomyMperBeat!);
            const economyBaseline = economyValues.length > 1
              ? economyValues.slice(0, -1).reduce((s, v) => s + v, 0) / (economyValues.length - 1)
              : null;
            const economyTrend = relativeTrend(
              latest?.distanceEconomyMperBeat,
              economyBaseline,
            );

            const elevationValues = data
              .filter((p) => p.elevationEconomyMperBeat !== null)
              .map((p) => p.elevationEconomyMperBeat!);
            const elevationBaseline = elevationValues.length > 1
              ? elevationValues.slice(0, -1).reduce((s, v) => s + v, 0) / (elevationValues.length - 1)
              : null;
            const elevationTrend = relativeTrend(
              latest?.elevationEconomyMperBeat,
              elevationBaseline,
            );

            const scoreBaseline = (() => {
              if (comparison) {
                const compScores = comparison
                  .map((p) => p.personalEfficiencyScore)
                  .filter((v): v is number => v !== null);
                if (compScores.length > 0) {
                  return {
                    baseline: compScores.reduce((s, v) => s + v, 0) / compScores.length,
                    label: comparisonTrendLabel(effectiveComparison) ?? "vs prior period",
                  };
                }
              }
              return { baseline: 100, label: "vs 100 baseline" };
            })();

            const scoreTrend =
              latest != null && latest.personalEfficiencyScore !== null && latest.personalEfficiencyScore !== undefined
                ? {
                    direction: latest.personalEfficiencyScore > scoreBaseline.baseline
                      ? ("up" as const)
                      : latest.personalEfficiencyScore < scoreBaseline.baseline
                        ? ("down" as const)
                        : ("neutral" as const),
                    value: `${latest.personalEfficiencyScore > scoreBaseline.baseline ? "+" : ""}${formatInteger(Math.round(latest.personalEfficiencyScore - scoreBaseline.baseline))}`,
                    label: scoreBaseline.label,
                  }
                : null;

            return (
              <div className="space-y-10">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    label="Latest HR drift"
                    value={formatFixedSignedPercent(latest?.hrDriftPct)}
                    detail="Second-half versus first-half efficiency"
                    icon={Gauge}
                    trend={
                      driftTrend
                          ? {
                            direction: driftTrend.direction,
                            value: formatFixedSignedPercent(driftTrend.diff, false),
                            label: "vs prior 90-day baseline",
                          }
                        : undefined
                    }
                  />
                  <MetricCard
                    label="Latest avg HR"
                    value={formatHeartRate(latest?.avgHeartRate)}
                    detail={
                      latest
                        ? `Measured during the run on ${formatDate(latest.activityDate)}`
                        : "No runs in the selected period"
                    }
                    icon={HeartPulse}
                    trend={
                      hrTrend
                        ? {
                          direction: hrTrend.direction,
                          lowerIsBetter: true,
                          value: `${hrTrend.diff > 0 ? "+" : ""}${formatInteger(Math.round(hrTrend.diff))} bpm`,
                          label: "vs prior run",
                        }
                        : undefined
                    }
                  />
                  <MetricCard
                    label="Latest recovery HR"
                    value={formatHeartRate(latestRecovery?.garminRecoveryHr)}
                    detail={
                      latestRecovery
                        ? `Measured after the run on ${formatDate(latestRecovery.activityDate)}`
                        : "No recovery HR recorded in the selected period"
                    }
                    icon={HeartPulse}
                    trend={
                      recoveryTrend
                        ? {
                            direction: recoveryTrend.direction,
                            value: `${recoveryTrend.diff > 0 ? "+" : ""}${formatDecimal2(recoveryTrend.diff)} bpm`,
                            label: "vs 4-run rolling",
                          }
                        : undefined
                    }
                  />
                  <MetricCard
                    label="Latest speed-to-HR ratio"
                    value={formatDecimal2(
                      latest?.efficiencyRatio === null || latest?.efficiencyRatio === undefined
                        ? null
                        : speedFromKmh(latest.efficiencyRatio, unit) * 10,
                    )}
                    detail={`${unit === "mi" ? "mi/h" : "km/h"} per 10 bpm`}
                    icon={Activity}
                    trend={
                      efficiencyTrend
                          ? {
                            direction: efficiencyTrend.direction,
                            value: formatFixedSignedPercent(efficiencyTrend.change, false),
                            label: comparisonEfficiency !== null ? (comparisonTrendLabel(effectiveComparison) ?? "vs comparison") : "vs 4-run rolling",
                          }
                        : undefined
                    }
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <MetricCard
                    label="Latest distance economy"
                    value={latest?.distanceEconomyMperBeat != null
                      ? `${latest.distanceEconomyMperBeat.toFixed(3)} m/beat`
                      : "\u2014"}
                    detail={`Distance per heartbeat on ${latest ? formatDate(latest.activityDate) : "\u2014"}`}
                    icon={ArrowRight}
                    trend={
                      economyTrend
                          ? {
                            direction: economyTrend.direction,
                            value: formatFixedSignedPercent(economyTrend.change, false),
                            label: "vs prior average",
                          }
                        : undefined
                    }
                  />
                  <MetricCard
                    label="Latest elevation economy"
                    value={latest?.elevationEconomyMperBeat != null
                      ? `${latest.elevationEconomyMperBeat.toFixed(4)} m/beat`
                      : "\u2014"}
                    detail="Vertical metres per heartbeat. Varies with terrain."
                    icon={Mountain}
                    trend={
                      elevationTrend
                          ? {
                            direction: elevationTrend.direction,
                            value: formatFixedSignedPercent(elevationTrend.change, false),
                            label: "vs prior average",
                          }
                        : undefined
                    }
                  />
                  <MetricCard
                    label="Latest efficiency score"
                    value={latest?.personalEfficiencyScore != null
                      ? `${Math.round(latest.personalEfficiencyScore)}`
                      : "\u2014"}
                    detail="100 = typical. Higher means more efficient than your recent norm."
                    icon={Sparkles}
                    trend={scoreTrend ?? undefined}
                  />
                </div>
                <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-2">
                  <ScrollReveal className="min-w-0 xl:col-span-2">
                    <HrDriftChart points={data} />
                  </ScrollReveal>
                  <ScrollReveal className="h-full min-w-0" delayMs={80}>
                    <PaceHeartRateTrend points={data} />
                  </ScrollReveal>
                  <ScrollReveal className="h-full min-w-0" delayMs={120}>
                    <FitnessEfficiencyChart points={data} />
                  </ScrollReveal>
                  <ScrollReveal className="h-full min-w-0" delayMs={140}>
                    <DistanceEconomyChart points={data} />
                  </ScrollReveal>
                  <ScrollReveal className="h-full min-w-0" delayMs={160}>
                    <ElevationEconomyChart points={data} />
                  </ScrollReveal>
                  <ScrollReveal className="h-full min-w-0 xl:col-span-2" delayMs={180}>
                    <EfficiencyScoreChart points={data} />
                  </ScrollReveal>
                  <ScrollReveal className="h-full min-w-0 xl:col-span-2" delayMs={200}>
                    <RecoveryHeartRateChart points={data} />
                  </ScrollReveal>
                </div>
              </div>
            );
          }}
        </DataState>
      </div>
    </AppShell>
  );
}
