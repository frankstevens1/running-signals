"use client";

import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatPace, formatSignedPercent, shortDate } from "@/app/lib/format";
import type { FitnessPoint, MonthRollup, WeekRollup } from "@/app/lib/types";

type NumericDomain = [number, number];

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "var(--surface-muted)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    color: "var(--text)",
    boxShadow: "0 16px 40px rgba(0, 0, 0, 0.28)",
  },
  labelStyle: {
    color: "var(--text)",
    fontWeight: 700,
    marginBottom: 4,
  },
  itemStyle: {
    color: "var(--text-soft)",
  },
};

function numberValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatKm(value: unknown) {
  const parsed = numberValue(value);
  return parsed === null ? "n/a" : `${parsed.toFixed(1)} km`;
}

function formatDays(value: unknown) {
  const parsed = numberValue(value);
  return parsed === null ? "n/a" : `${Math.round(parsed)} days`;
}

function formatRuns(value: unknown) {
  const parsed = numberValue(value);
  return parsed === null ? "n/a" : `${Math.round(parsed)} runs`;
}

function formatBpm(value: unknown) {
  const parsed = numberValue(value);
  return parsed === null ? "n/a" : `${Math.round(parsed)} bpm`;
}

function formatPercentValue(value: unknown) {
  const parsed = numberValue(value);
  return parsed === null ? "n/a" : `${Math.round(parsed * 100)}%`;
}

function formatSignedPercentValue(value: unknown) {
  const parsed = numberValue(value);
  return parsed === null ? "n/a" : formatSignedPercent(parsed);
}

function formatPaceValue(value: unknown) {
  const parsed = numberValue(value);
  return parsed === null ? "n/a" : formatPace(parsed);
}

function formatMonthTick(value: unknown) {
  if (!value) return "n/a";
  const date = new Date(`${String(value)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
  }).format(date);
}

function formatMonthLabel(value: unknown) {
  if (!value) return "n/a";
  const date = new Date(`${String(value)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(date);
}

function getEfficiencyDomain(points: FitnessPoint[]): NumericDomain {
  const values = points
    .flatMap((point) => [point.efficiencyRatio, point.rolling4RunEfficiencyRatio])
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (values.length === 0) {
    return [0, 0.1];
  }

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    const padding = Math.max(Math.abs(min) * 0.08, 0.005);
    return [Math.max(0, min - padding), max + padding];
  }

  const padding = Math.max((max - min) * 0.15, 0.002);
  return [Math.max(0, min - padding), max + padding];
}

function ChartFrame({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-(--border) bg-(--surface) p-4">
      <h2 className="text-base font-semibold text-(--text)">{title}</h2>
      {description ? <p className="mt-1 text-sm text-(--text-soft)">{description}</p> : null}
      <div className="mt-4 h-80">{children}</div>
    </div>
  );
}

export function WeeklyVolumeChart({ weeks }: { weeks: WeekRollup[] }) {
  return (
    <ChartFrame
      title="Weekly distance and rolling volume"
      description="Distance in kilometers by completed week."
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={weeks}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="weekStartDate"
            tickFormatter={shortDate}
            minTickGap={28}
            tick={{ fill: "var(--text-soft)", fontSize: 12 }}
          />
          <YAxis tick={{ fill: "var(--text-soft)", fontSize: 12 }} tickFormatter={formatKm} />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(value) => shortDate(String(value))}
            formatter={(value, name) => [formatKm(value), name]}
          />
          <Legend />
          <Area
            type="monotone"
            dataKey="weeklyDistanceKm"
            name="Weekly distance"
            stroke="var(--accent)"
            fill="var(--accent-soft)"
          />
          <Line
            type="monotone"
            dataKey="rolling4wDistanceKm"
            name="Rolling 4w distance"
            stroke="var(--signal)"
            strokeWidth={2}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function MonthlyVolumeChart({ months }: { months: MonthRollup[] }) {
  return (
    <ChartFrame title="Monthly volume" description="Calendar-month distance and run frequency.">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={months} margin={{ top: 16, right: 8, left: 8 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="monthStartDate"
            tickFormatter={formatMonthTick}
            minTickGap={28}
            tick={{ fill: "var(--text-soft)", fontSize: 12 }}
          />
          <YAxis
            yAxisId="left"
            tick={{ fill: "var(--text-soft)", fontSize: 12 }}
            tickFormatter={formatKm}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: "var(--text-soft)", fontSize: 12 }}
            tickFormatter={formatRuns}
          />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={formatMonthLabel}
            formatter={(value, name) => [
              name === "Runs" ? formatRuns(value) : formatKm(value),
              name,
            ]}
          />
          <Legend />
          <Bar
            yAxisId="left"
            dataKey="monthlyDistanceKm"
            name="Monthly distance"
            fill="var(--accent)"
            radius={[3, 3, 0, 0]}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="runsPerMonth"
            name="Runs"
            stroke="var(--signal-ok)"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function WeeklyStructureChart({ weeks }: { weeks: WeekRollup[] }) {
  return (
    <ChartFrame
      title="Weekly structure"
      description="Active days alongside the long-run share of weekly distance."
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={weeks}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="weekStartDate"
            tickFormatter={shortDate}
            minTickGap={28}
            tick={{ fill: "var(--text-soft)", fontSize: 12 }}
          />
          <YAxis
            yAxisId="left"
            tick={{ fill: "var(--text-soft)", fontSize: 12 }}
            tickFormatter={formatDays}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: "var(--text-soft)", fontSize: 12 }}
            tickFormatter={formatPercentValue}
          />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(value) => shortDate(String(value))}
            formatter={(value, name) => [
              name === "Long-run share" ? formatPercentValue(value) : formatDays(value),
              name,
            ]}
          />
          <Legend />
          <Bar
            yAxisId="left"
            dataKey="activeDays"
            name="Active days"
            fill="var(--accent)"
            radius={[3, 3, 0, 0]}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="longRunShareOfWeek"
            name="Long-run share"
            stroke="var(--signal)"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function HrDriftChart({ points }: { points: FitnessPoint[] }) {
  return (
    <ChartFrame
      title="Heart-rate drift over time"
      description="Second-half efficiency versus first-half efficiency."
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="activityDate"
            tickFormatter={shortDate}
            minTickGap={28}
            tick={{ fill: "var(--text-soft)", fontSize: 12 }}
          />
          <YAxis
            tick={{ fill: "var(--text-soft)", fontSize: 12 }}
            tickFormatter={formatSignedPercentValue}
          />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(value) => shortDate(String(value))}
            formatter={(value, name) => [formatSignedPercentValue(value), name]}
          />
          <Legend />
          <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="4 4" />
          <Line
            type="monotone"
            dataKey="hrDriftPct"
            name="HR drift"
            stroke="var(--accent)"
            strokeWidth={1.5}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="rolling4RunHrDriftPct"
            name="Rolling 4-run drift"
            stroke="var(--signal)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function FitnessEfficiencyChart({ points }: { points: FitnessPoint[] }) {
  const efficiencyDomain = getEfficiencyDomain(points);

  return (
    <ChartFrame
      title="Speed per heartbeat"
      description="Session speed divided by average heart rate."
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="activityDate"
            tickFormatter={shortDate}
            minTickGap={28}
            tick={{ fill: "var(--text-soft)", fontSize: 12 }}
          />
          <YAxis
            domain={efficiencyDomain}
            tick={{ fill: "var(--text-soft)", fontSize: 12 }}
            tickFormatter={(value) => Number(value).toFixed(3)}
          />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(value) => shortDate(String(value))}
            formatter={(value, name) => [
              numberValue(value)?.toFixed(3) ?? "n/a",
              name,
            ]}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="efficiencyRatio"
            name="Efficiency"
            stroke="var(--accent)"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="rolling4RunEfficiencyRatio"
            name="Rolling 4-run efficiency"
            stroke="var(--signal)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function PaceHeartRateScatter({ points }: { points: FitnessPoint[] }) {
  const data = points.filter(
    (point) => point.avgHeartRate !== null && point.avgPaceMinPerKm !== null,
  );

  return (
    <ChartFrame
      title="Pace versus heart rate"
      description="Each point is one run; faster paces sit higher because the pace axis is reversed."
    >
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ right: 18 }}>
          <CartesianGrid stroke="var(--border)" />
          <XAxis
            dataKey="avgHeartRate"
            name="Average HR"
            unit=" bpm"
            tick={{ fill: "var(--text-soft)", fontSize: 12 }}
            tickFormatter={(value) => `${Math.round(Number(value))}`}
          />
          <YAxis
            dataKey="avgPaceMinPerKm"
            name="Pace"
            reversed
            tick={{ fill: "var(--text-soft)", fontSize: 12 }}
            tickFormatter={formatPaceValue}
          />
          <Tooltip
            {...tooltipStyle}
            cursor={{ strokeDasharray: "3 3", stroke: "var(--accent)" }}
            formatter={(value, name) => [
              name === "Average HR" ? formatBpm(value) : formatPaceValue(value),
              name,
            ]}
            labelFormatter={() => "Run"}
          />
          <Scatter name="Runs" data={data} fill="var(--accent)" />
        </ScatterChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
