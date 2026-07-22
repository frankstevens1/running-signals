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
} from "@/app/components/trend-charts";
import { getFitness } from "@/app/lib/data";
import { speedFromKmh } from "@/app/lib/distance-unit";
import { formatDecimal3, formatHeartRate, formatInteger, formatSignedPercent } from "@/app/lib/format";
import { explorerPages } from "@/app/lib/page-metadata";
import { getServerDistanceUnit } from "@/app/lib/server-distance-unit";

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

export default async function FitnessPage() {
  const [fitness, unit] = await Promise.all([getFitness(180), getServerDistanceUnit()]);

  return (
    <AppShell>
      <div className="space-y-10">
        <SectionHeading
          eyebrow="signal_fitness"
          title="Descriptive fitness trends"
          description="Fitness views stay descriptive: heart-rate drift over time, pace at comparable heart rate, speed per heartbeat, recovery HR availability, and same-day health context."
          icon={explorerPages.fitness.icon}
        />
        <DataState result={fitness}>
          {(data) => {
            const latest = data.at(-1);
            const penultimate = data.at(-2);
            const recoveryCount = data.filter((point) => point.garminRecoveryHr !== null).length;
            const driftCount = data.filter((point) => point.hrDriftPct !== null).length;

            const driftTrend =
              latest && penultimate
                ? trendDelta(latest.hrDriftPct, penultimate.hrDriftPct)
                : null;

            const hrTrend =
              latest && penultimate
                ? trendDelta(latest.avgHeartRate, penultimate.avgHeartRate)
                : null;

            const efficiencyTrend =
              latest && penultimate
                ? trendDelta(latest.efficiencyRatio, penultimate.efficiencyRatio)
                : null;

            return (
              <div className="space-y-10">
                <div className="grid gap-4 md:grid-cols-3">
                  <MetricCard
                    label="Latest HR drift"
                    value={formatSignedPercent(latest?.hrDriftPct)}
                    detail="Second-half versus first-half efficiency"
                    icon={Gauge}
                    trend={
                      driftTrend
                        ? {
                            direction: driftTrend.direction,
                            invert: (penultimate?.hrDriftPct ?? 0) > 0,
                            value: formatSignedPercent(driftTrend.diff),
                            label: "vs prior run",
                          }
                        : undefined
                    }
                  />
                  <MetricCard
                    label="Latest avg HR"
                    value={formatHeartRate(latest?.avgHeartRate)}
                    detail={`Recovery HR on ${formatInteger(recoveryCount)} returned runs`}
                    icon={HeartPulse}
                    trend={
                      hrTrend
                        ? {
                            direction: hrTrend.direction,
                            value: `${hrTrend.diff > 0 ? "+" : ""}${formatInteger(Math.round(hrTrend.diff))} bpm`,
                            label: "vs prior run",
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
                    detail={`${unit === "mi" ? "mph" : "km/h"} per bpm; ${formatInteger(driftCount)} runs with drift`}
                    icon={Activity}
                    trend={
                      efficiencyTrend
                        ? {
                            direction: efficiencyTrend.direction,
                            value: `${efficiencyTrend.diff > 0 ? "+" : ""}${formatDecimal3(Math.abs(efficiencyTrend.diff))}`,
                            label: "vs prior run",
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
                </div>
              </div>
            );
          }}
        </DataState>
      </div>
    </AppShell>
  );
}
