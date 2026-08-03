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
  AerobicDecouplingChart,
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
  const [fitness, unit] = await Promise.all([
    getFitness(analyticsWindow.primary),
    getServerDistanceUnit(),
  ]);

  return (
    <AppShell>
      <div className="space-y-10">
        <SectionHeading
          eyebrow="mart_fitness"
          title="Descriptive fitness trends"
          description="Fitness views stay descriptive: aerobic decoupling, pace at comparable heart rate, speed-to-HR ratio, and post-run recovery HR."
          icon={explorerPages.fitness.icon}
        />
        <DataState result={fitness}>
          {(data) => {
            const latest = data.at(-1);
            const penultimate = data.at(-2);
            const latestRecovery = [...data]
              .reverse()
              .find((point) => point.garminRecoveryHr !== null);
            const latestAerobicDecoupling = [...data]
              .reverse()
              .find((point) =>
                point.aerobicDecouplingStatus === "eligible"
                && point.aerobicDecouplingPct !== null,
              );

            const aerobicDecouplingTrend = trendDelta(
              latestAerobicDecoupling?.aerobicDecouplingPct,
              latestAerobicDecoupling?.aerobicDecouplingPrior90dCount != null
                && latestAerobicDecoupling.aerobicDecouplingPrior90dCount >= 4
                ? latestAerobicDecoupling.aerobicDecouplingPrior90dMedian
                : null,
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

            const latestSpeedToHr = [...data]
              .reverse()
              .find((point) => point.efficiencyRatio !== null);
            const efficiencyValues = data
              .filter((point) => point.efficiencyRatio !== null)
              .map((point) => point.efficiencyRatio!);
            const priorEfficiencyValues = efficiencyValues.slice(0, -1).slice(-4);
            const efficiencyBaseline = priorEfficiencyValues.length === 4
              ? priorEfficiencyValues.reduce((sum, value) => sum + value, 0) / 4
              : null;
            const efficiencyTrend = relativeTrend(
              latestSpeedToHr?.efficiencyRatio,
              efficiencyBaseline,
            );

            const latestDistanceEconomy = [...data]
              .reverse()
              .find((point) => point.distanceEconomyMperBeat !== null);
            const economyValues = data
              .filter((p) => p.distanceEconomyMperBeat !== null)
              .map((p) => p.distanceEconomyMperBeat!);
            const priorEconomyValues = economyValues.slice(0, -1);
            const economyBaseline = priorEconomyValues.length > 0
              ? priorEconomyValues.reduce((s, v) => s + v, 0) / priorEconomyValues.length
              : null;
            const economyTrend = relativeTrend(
              latestDistanceEconomy?.distanceEconomyMperBeat,
              economyBaseline,
            );

            const latestElevationEconomy = [...data]
              .reverse()
              .find((point) => point.elevationEconomyMperBeat !== null);
            const elevationValues = data
              .filter((p) => p.elevationEconomyMperBeat !== null)
              .map((p) => p.elevationEconomyMperBeat!);
            const priorElevationValues = elevationValues.slice(0, -1);
            const elevationBaseline = priorElevationValues.length > 0
              ? priorElevationValues.reduce((s, v) => s + v, 0) / priorElevationValues.length
              : null;
            const elevationTrend = relativeTrend(
              latestElevationEconomy?.elevationEconomyMperBeat,
              elevationBaseline,
            );

            const latestEfficiencyScore = [...data]
              .reverse()
              .find((point) => point.personalEfficiencyScore !== null);

            const scoreTrend =
              latestEfficiencyScore?.personalEfficiencyScore != null
                ? {
                    direction: latestEfficiencyScore.personalEfficiencyScore > 100
                      ? ("up" as const)
                      : latestEfficiencyScore.personalEfficiencyScore < 100
                        ? ("down" as const)
                        : ("neutral" as const),
                    value: `${latestEfficiencyScore.personalEfficiencyScore > 100 ? "+" : ""}${formatInteger(Math.round(latestEfficiencyScore.personalEfficiencyScore - 100))}`,
                    label: "vs 90-day personal baseline",
                  }
                : null;

            return (
              <div className="space-y-10">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    label="Latest aerobic decoupling"
                    value={formatFixedSignedPercent(latestAerobicDecoupling?.aerobicDecouplingPct)}
                    detail={latestAerobicDecoupling
                      ? `Eligible run on ${formatDate(latestAerobicDecoupling.activityDate)}. Positive means lower second-half efficiency.`
                      : "No run in the selected period met the aerobic-decoupling quality gates."}
                    icon={Gauge}
                    trend={
                      aerobicDecouplingTrend
                          ? {
                            direction: aerobicDecouplingTrend.direction,
                            lowerIsBetter: true,
                            value: formatFixedSignedPercent(aerobicDecouplingTrend.diff, false),
                            label: "vs prior 90-day median",
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
                      latestSpeedToHr?.efficiencyRatio === null || latestSpeedToHr?.efficiencyRatio === undefined
                        ? null
                        : speedFromKmh(latestSpeedToHr.efficiencyRatio, unit) * 10,
                    )}
                    detail={`${unit === "mi" ? "mi/h" : "km/h"} per 10 bpm`}
                    icon={Activity}
                    trend={
                      efficiencyTrend
                          ? {
                            direction: efficiencyTrend.direction,
                            value: formatFixedSignedPercent(efficiencyTrend.change, false),
                            label: "vs prior 4-run mean",
                          }
                        : undefined
                    }
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <MetricCard
                    label="Latest distance economy"
                    value={latestDistanceEconomy?.distanceEconomyMperBeat != null
                      ? `${latestDistanceEconomy.distanceEconomyMperBeat.toFixed(3)} m/beat`
                      : "\u2014"}
                    detail={`Distance per heartbeat on ${latestDistanceEconomy ? formatDate(latestDistanceEconomy.activityDate) : "\u2014"}`}
                    icon={ArrowRight}
                    trend={
                      economyTrend
                          ? {
                            direction: economyTrend.direction,
                            value: formatFixedSignedPercent(economyTrend.change, false),
                            label: `vs prior ${priorEconomyValues.length}-run mean`,
                          }
                        : undefined
                    }
                  />
                  <MetricCard
                    label="Latest efficiency score"
                    value={latestEfficiencyScore?.personalEfficiencyScore != null
                      ? `${Math.round(latestEfficiencyScore.personalEfficiencyScore)}`
                      : "\u2014"}
                    detail="100 = typical. Higher means more efficient than your recent norm."
                    icon={Sparkles}
                    trend={scoreTrend ?? undefined}
                  />
                  <MetricCard
                    label="Latest elevation economy"
                    value={latestElevationEconomy?.elevationEconomyMperBeat != null
                      ? `${latestElevationEconomy.elevationEconomyMperBeat.toFixed(4)} m/beat`
                      : "\u2014"}
                    detail={`Vertical metres per heartbeat on ${latestElevationEconomy ? formatDate(latestElevationEconomy.activityDate) : "\u2014"}. Varies with terrain.`}
                    icon={Mountain}
                    trend={
                      elevationTrend
                          ? {
                            direction: elevationTrend.direction,
                            value: formatFixedSignedPercent(elevationTrend.change, false),
                            label: `vs prior ${priorElevationValues.length}-run mean`,
                          }
                        : undefined
                    }
                  />
                </div>
                <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-2">
                  <ScrollReveal className="min-w-0 xl:col-span-2">
                    <AerobicDecouplingChart points={data} />
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
