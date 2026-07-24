import { Activity, Gauge, HeartPulse } from "lucide-react";

import { AppShell } from "@/app/components/app-shell";
import { DataState } from "@/app/components/data-state";
import { MetricCard } from "@/app/components/metric-card";
import { ScrollReveal } from "@/app/components/motion-reveal";
import { SectionHeading } from "@/app/components/section-heading";
import {
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
  formatDecimal3,
  formatHeartRate,
  formatInteger,
} from "@/app/lib/format";
import { explorerPages } from "@/app/lib/page-metadata";
import { getServerDistanceUnit } from "@/app/lib/server-distance-unit";
import { getServerAnalyticsWindow } from "@/app/lib/analytics-window-server";

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
  const [fitness, comparisonFitness, unit] = await Promise.all([
    getFitness(analyticsWindow.primary),
    analyticsWindow.comparison ? getFitness(analyticsWindow.comparison) : null,
    getServerDistanceUnit(),
  ]);

  return (
    <AppShell>
      <div className="space-y-10">
        <SectionHeading
          eyebrow="signal_fitness"
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
              latestRecovery?.rolling4RunRecoveryHr,
            );

            const efficiencyBaseline = comparisonEfficiency ?? latest?.rolling4RunEfficiencyRatio;
            const efficiencyTrend = relativeTrend(
              latest?.efficiencyRatio,
              efficiencyBaseline,
            );

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
                            label: "vs 4-run rolling",
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
                        : "No runs in the loaded window"
                    }
                    icon={HeartPulse}
                    trend={
                      hrTrend
                        ? {
                          direction: hrTrend.direction,
                          invert: true,
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
                        : "No recovery HR recorded in the loaded window"
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
                    label="Latest efficiency"
                    value={formatDecimal3(
                      latest?.efficiencyRatio === null || latest?.efficiencyRatio === undefined
                        ? null
                        : speedFromKmh(latest.efficiencyRatio, unit),
                    )}
                    detail={`${unit === "mi" ? "mph" : "km/h"} per bpm`}
                    icon={Activity}
                    trend={
                      efficiencyTrend
                          ? {
                            direction: efficiencyTrend.direction,
                            value: formatFixedSignedPercent(efficiencyTrend.change, false),
                            label: comparisonEfficiency !== null ? "vs comparison window" : "vs 4-run rolling",
                          }
                        : undefined
                    }
                  />
                </div>
                <div className="grid gap-6 xl:grid-cols-2">
                  <ScrollReveal className="xl:col-span-2">
                    <HrDriftChart points={data} />
                  </ScrollReveal>
                  <ScrollReveal className="h-full" delayMs={80}>
                    <PaceHeartRateTrend points={data} />
                  </ScrollReveal>
                  <ScrollReveal className="h-full" delayMs={120}>
                    <FitnessEfficiencyChart points={data} />
                  </ScrollReveal>
                  <ScrollReveal className="h-full xl:col-span-2" delayMs={160}>
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
