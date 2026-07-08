import { Activity, Gauge, HeartPulse } from "lucide-react";

import { AppShell } from "@/app/components/app-shell";
import { DataState } from "@/app/components/data-state";
import { MetricCard } from "@/app/components/metric-card";
import { SectionHeading } from "@/app/components/section-heading";
import {
  FitnessEfficiencyChart,
  HrDriftChart,
  PaceHeartRateTrend,
} from "@/app/components/trend-charts";
import { getFitness } from "@/app/lib/data";
import { formatHeartRate, formatInteger, formatNumber, formatSignedPercent } from "@/app/lib/format";
import { explorerPages } from "@/app/lib/page-metadata";

export default async function FitnessPage() {
  const fitness = await getFitness(180);

  return (
    <AppShell>
      <div className="space-y-6">
        <SectionHeading
          eyebrow="signal_fitness"
          title="Descriptive fitness trends"
          description="Fitness views stay descriptive: heart-rate drift over time, pace at comparable heart rate, speed per heartbeat, recovery HR availability, and same-day health context."
          icon={explorerPages.fitness.icon}
        />
        <DataState result={fitness}>
          {(data) => {
            const latest = data.at(-1);
            const recoveryCount = data.filter((point) => point.garminRecoveryHr !== null).length;
            const driftCount = data.filter((point) => point.hrDriftPct !== null).length;

            return (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <MetricCard
                    label="Latest HR drift"
                    value={formatSignedPercent(latest?.hrDriftPct)}
                    detail="Second-half versus first-half efficiency"
                    icon={Gauge}
                  />
                  <MetricCard
                    label="Latest avg HR"
                    value={formatHeartRate(latest?.avgHeartRate)}
                    detail={`Recovery HR on ${formatInteger(recoveryCount)} returned runs`}
                    icon={HeartPulse}
                  />
                  <MetricCard
                    label="Latest efficiency"
                    value={formatNumber(latest?.efficiencyRatio)}
                    detail={`${formatInteger(driftCount)} returned runs with drift signal`}
                    icon={Activity}
                  />
                </div>
                <div className="grid gap-6 xl:grid-cols-2">
                  <div className="xl:col-span-2">
                    <HrDriftChart points={data} />
                  </div>
                  <PaceHeartRateTrend points={data} />
                  <FitnessEfficiencyChart points={data} />
                </div>
              </div>
            );
          }}
        </DataState>
      </div>
    </AppShell>
  );
}
