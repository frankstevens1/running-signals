"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatPace, formatSignedPercent, shortDate } from "@/app/lib/format";
import type { FitnessPoint, MonthRollup, WeekRollup } from "@/app/lib/types";
import {
  MetricInfoDialog,
  type MetricInfoContent,
} from "@/app/components/metric-info-dialog";

type NumericDomain = [number, number];
type PaceHeartRatePoint = FitnessPoint & {
  avgHeartRate: number;
  avgPaceMinPerKm: number;
};
type HeartRateBand = {
  id: string;
  label: string;
  min: number;
  max: number;
  count: number;
};
type PaceHeartRateChartPoint = PaceHeartRatePoint & {
  activityDateTimestamp: number;
};
type PaceHeartRateTrendPoint = {
  activityDateTimestamp: number;
  trendPaceMinPerKm: number;
};
type WeeklyVolumeDatum = WeekRollup & {
  longestRunDistanceKm: number;
  otherWeeklyDistanceKm: number;
};

const HEART_RATE_BAND_SIZE_BPM = 10;
const PACE_DOMAIN_PADDING_MIN_PER_KM = 0.25;
const DAY_MS = 24 * 60 * 60 * 1000;
const BAND_SERIES_COLORS = [
  "var(--chart-3)",
  "var(--chart-blue)",
  "var(--chart-4)",
  "var(--chart-magenta)",
  "var(--chart-2)",
  "var(--chart-5)",
];
const PRIMARY_SERIES_COLOR = "var(--chart-1)";
const SECONDARY_SERIES_COLOR = "var(--chart-3)";
const MUTED_SERIES_COLOR =
  "color-mix(in srgb, var(--accent) 18%, var(--surface-muted))";
const CHART_GRID_COLOR =
  "color-mix(in srgb, var(--border) 68%, transparent)";
const axisTick = {
  fill: "var(--text-soft)",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
};
const timestampTickFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
const timestampLabelFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 2,
    color: "var(--text)",
    boxShadow: "0 12px 32px color-mix(in srgb, var(--background) 34%, transparent)",
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    lineHeight: 1.35,
    padding: "8px 10px",
  },
  labelStyle: {
    color: "var(--text)",
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 2,
  },
  itemStyle: {
    color: "var(--text-soft)",
    fontSize: 11,
    padding: 0,
  },
};

const legendProps = {
  iconSize: 8,
  formatter: (value: string) => (
    <span className="font-mono text-(--text-soft)">{value}</span>
  ),
  wrapperStyle: {
    color: "var(--text-soft)",
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    lineHeight: "16px",
    paddingTop: 4,
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

function formatSignedPercentValue(value: unknown) {
  const parsed = numberValue(value);
  return parsed === null ? "n/a" : formatSignedPercent(parsed);
}

function formatPaceValue(value: unknown) {
  const parsed = numberValue(value);
  return parsed === null ? "n/a" : formatPace(parsed);
}

function getActivityDateTimestamp(value: string): number {
  return new Date(`${value}T00:00:00`).getTime();
}

function formatTimestampTick(value: unknown) {
  const parsed = numberValue(value);
  return parsed === null ? "n/a" : timestampTickFormat.format(new Date(parsed));
}

function formatTimestampLabel(value: unknown) {
  const parsed = numberValue(value);
  return parsed === null ? "n/a" : timestampLabelFormat.format(new Date(parsed));
}

function hasPaceHeartRate(point: FitnessPoint): point is PaceHeartRatePoint {
  return (
    Number.isFinite(getActivityDateTimestamp(point.activityDate)) &&
    point.avgHeartRate !== null &&
    Number.isFinite(point.avgHeartRate) &&
    point.avgPaceMinPerKm !== null &&
    Number.isFinite(point.avgPaceMinPerKm)
  );
}

function getHeartRateBands(points: PaceHeartRatePoint[]): HeartRateBand[] {
  if (points.length === 0) return [];

  const heartRates = points.map((point) => point.avgHeartRate);
  const firstBand =
    Math.floor(Math.min(...heartRates) / HEART_RATE_BAND_SIZE_BPM) *
    HEART_RATE_BAND_SIZE_BPM;
  const lastBand =
    Math.floor(Math.max(...heartRates) / HEART_RATE_BAND_SIZE_BPM) *
    HEART_RATE_BAND_SIZE_BPM;
  const bands: HeartRateBand[] = [];

  for (let min = firstBand; min <= lastBand; min += HEART_RATE_BAND_SIZE_BPM) {
    const max = min + HEART_RATE_BAND_SIZE_BPM;
    const count = points.filter(
      (point) => point.avgHeartRate >= min && point.avgHeartRate < max,
    ).length;

    if (count > 0) {
      bands.push({
        id: `${min}-${max}`,
        label: `${min}-${max - 1}`,
        min,
        max,
        count,
      });
    }
  }

  return bands;
}

function getPaceDomain(points: PaceHeartRatePoint[]): NumericDomain {
  if (points.length === 0) return [0, 10];

  const paces = points.map((point) => point.avgPaceMinPerKm);
  const min = Math.min(...paces) - PACE_DOMAIN_PADDING_MIN_PER_KM;
  const max = Math.max(...paces) + PACE_DOMAIN_PADDING_MIN_PER_KM;

  return [Math.max(0, Math.floor(min * 10) / 10), Math.ceil(max * 10) / 10];
}

function heartRateBandButtonClass(isSelected: boolean) {
  const base =
    "inline-flex h-7 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-sm border px-2 font-mono text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-2 focus-visible:ring-offset-(--surface)";

  return isSelected
    ? `${base} border-(--accent) bg-(--accent-soft) text-(--accent-strong)`
    : `${base} border-(--border) bg-(--surface) text-(--text-soft) hover:border-(--accent) hover:text-(--text)`;
}

function FitnessLineLegend({
  sessionLabel,
  rollingLabel,
}: {
  sessionLabel: string;
  rollingLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-1 font-mono text-[11px] leading-4 text-(--text-soft)">
      <span className="inline-flex items-center gap-1.5">
        <span
          className="w-5 rounded-full"
          style={{ backgroundColor: PRIMARY_SERIES_COLOR, height: 1.5 }}
          aria-hidden="true"
        />
        {sessionLabel}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="w-5 rounded-full"
          style={{ backgroundColor: SECONDARY_SERIES_COLOR, height: 3 }}
          aria-hidden="true"
        />
        {rollingLabel}
      </span>
    </div>
  );
}

function getBandColor(index: number) {
  return BAND_SERIES_COLORS[index % BAND_SERIES_COLORS.length];
}

function getLinearPaceTrend(
  points: PaceHeartRateChartPoint[],
): PaceHeartRateTrendPoint[] {
  if (points.length < 2) return [];

  const sortedPoints = [...points].sort(
    (left, right) => left.activityDateTimestamp - right.activityDateTimestamp,
  );
  const firstTimestamp = sortedPoints[0]?.activityDateTimestamp;
  const lastTimestamp = sortedPoints.at(-1)?.activityDateTimestamp;

  if (
    firstTimestamp === undefined ||
    lastTimestamp === undefined ||
    firstTimestamp === lastTimestamp
  ) {
    return [];
  }

  const count = sortedPoints.length;
  const meanTimestamp =
    sortedPoints.reduce((total, point) => total + point.activityDateTimestamp, 0) / count;
  const meanPace =
    sortedPoints.reduce((total, point) => total + point.avgPaceMinPerKm, 0) / count;
  const totals = sortedPoints.reduce(
    (accumulator, point) => {
      const centeredTimestamp = point.activityDateTimestamp - meanTimestamp;
      const centeredPace = point.avgPaceMinPerKm - meanPace;

      accumulator.xy += centeredTimestamp * centeredPace;
      accumulator.xx += centeredTimestamp * centeredTimestamp;
      return accumulator;
    },
    { xy: 0, xx: 0 },
  );

  if (totals.xx === 0) return [];

  const slope = totals.xy / totals.xx;
  const intercept = meanPace - slope * meanTimestamp;

  return [firstTimestamp, lastTimestamp].map((activityDateTimestamp) => ({
    activityDateTimestamp,
    trendPaceMinPerKm: slope * activityDateTimestamp + intercept,
  }));
}

function getMonthStartTicks(minTimestamp: number, maxTimestamp: number): number[] {
  const tickDate = new Date(minTimestamp);
  tickDate.setHours(0, 0, 0, 0);
  tickDate.setDate(1);

  if (tickDate.getTime() < minTimestamp) {
    tickDate.setMonth(tickDate.getMonth() + 1);
  }

  const ticks: number[] = [];
  while (tickDate.getTime() <= maxTimestamp) {
    ticks.push(tickDate.getTime());
    tickDate.setMonth(tickDate.getMonth() + 1);
  }

  return ticks;
}

function getDayIntervalTicks(
  minTimestamp: number,
  maxTimestamp: number,
  intervalDays: number,
): number[] {
  const tickDate = new Date(minTimestamp);
  tickDate.setHours(0, 0, 0, 0);

  while (tickDate.getDay() !== 1 && tickDate.getTime() < maxTimestamp) {
    tickDate.setDate(tickDate.getDate() + 1);
  }

  const ticks: number[] = [];
  while (tickDate.getTime() <= maxTimestamp) {
    ticks.push(tickDate.getTime());
    tickDate.setDate(tickDate.getDate() + intervalDays);
  }

  return ticks;
}

function getShortRangeDateTicks(
  minTimestamp: number,
  maxTimestamp: number,
  rangeDays: number,
): number[] {
  const tickDate = new Date(minTimestamp);
  tickDate.setHours(0, 0, 0, 0);

  const intervalDays = Math.max(1, Math.ceil(rangeDays / 6));
  const ticks: number[] = [];

  while (tickDate.getTime() <= maxTimestamp) {
    ticks.push(tickDate.getTime());
    tickDate.setDate(tickDate.getDate() + intervalDays);
  }

  return ticks;
}

function getPaceHeartRateDateTicks(points: PaceHeartRateChartPoint[]): number[] {
  if (points.length === 0) return [];

  const timestamps = points.map((point) => point.activityDateTimestamp);
  const minTimestamp = Math.min(...timestamps);
  const maxTimestamp = Math.max(...timestamps);
  const rangeDays = Math.max(1, Math.round((maxTimestamp - minTimestamp) / DAY_MS));

  if (rangeDays >= 120) {
    return getMonthStartTicks(minTimestamp, maxTimestamp);
  }

  if (rangeDays >= 60) {
    return getDayIntervalTicks(minTimestamp, maxTimestamp, 14);
  }

  if (rangeDays >= 21) {
    return getDayIntervalTicks(minTimestamp, maxTimestamp, 7);
  }

  return getShortRangeDateTicks(minTimestamp, maxTimestamp, rangeDays);
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

function getCompleteStructureWeeks(weeks: WeekRollup[]) {
  return weeks.filter((week) => week.activeDays + week.missedDays === 7);
}

function getWeeklyVolumeBreakdown(weeks: WeekRollup[]): WeeklyVolumeDatum[] {
  return weeks.map((week) => {
    const longestRunDistanceKm = Math.min(
      Math.max(week.longRunDistanceKm ?? 0, 0),
      week.weeklyDistanceKm,
    );

    return {
      ...week,
      longestRunDistanceKm,
      otherWeeklyDistanceKm: Math.max(week.weeklyDistanceKm - longestRunDistanceKm, 0),
    };
  });
}

const CHART_INFO = {
  weeklyVolume: {
    title: "Weekly distance and rolling volume",
    definition:
      "Weekly distance is the total run distance in a completed calendar week. The stacked bars split that week into the longest single run and the remaining distance. Rolling 4w distance is the current completed week plus the previous three completed weeks.",
    source: "dbt mart_weeks, from mart_days session rollups.",
    interpretation: [
      "The total bar height is weekly load. Taller bars mean more distance accumulated that week.",
      "A large longest-run segment means the week was concentrated in one run; a larger remaining segment means the distance was spread across more sessions.",
      "The rolling 4w line is the better trend signal because it smooths week-to-week noise.",
    ],
    caveats: [
      "This is load description, not a prescription. Big jumps may matter operationally, but the chart does not label them as good or bad.",
      "Only completed weeks should be compared directly; partial weeks can understate volume.",
    ],
  },
  monthlyVolume: {
    title: "Monthly volume",
    definition:
      "Monthly distance is the sum of daily run distance in each calendar month. Runs is the count of running activities observed in that same month.",
    source: "dbt mart_months, rolled up from mart_days.",
    interpretation: [
      "Read the bars as accumulated monthly distance and the line as how often runs occurred.",
      "Rising distance with flat run count usually means longer average runs. Rising run count with flat distance usually means shorter, more frequent runs.",
      "Use this chart for broad seasonality and training blocks rather than single-week decisions.",
    ],
    caveats: [
      "Calendar months have different lengths, so month-to-month comparisons are directional.",
      "The current month may be incomplete depending on the loaded data window.",
    ],
  },
  weeklyStructure: {
    title: "Weekly structure",
    definition:
      "Active days are completed calendar days with at least one run. Missed days are completed calendar days with no run. The chart shows completed weeks where the active and missed day counts add to seven.",
    source: "dbt mart_weeks, from mart_days active_day_flag and missed_day_flag.",
    interpretation: [
      "More active days means higher run frequency in that completed week.",
      "Missed days are non-run days, not failures. Rest days, cross-training, travel, and planned breaks all appear as missed run days.",
      "Look for consistency patterns across several weeks rather than treating one week as decisive.",
    ],
    caveats: [
      "This chart measures running regularity only. It does not know whether non-run days were planned recovery or other training.",
    ],
  },
  hrDrift: {
    title: "Heart-rate drift over time",
    definition:
      "Heart-rate drift compares second-half run efficiency with first-half run efficiency. Segment efficiency is average speed divided by average heart rate. Drift is second-half efficiency divided by first-half efficiency minus one.",
    source: "dbt signal_fitness, using mart_run_segments.",
    interpretation: [
      "Near 0% means second-half efficiency was similar to first-half efficiency.",
      "Negative values mean the second half produced less speed per heartbeat. That can reflect fatigue, heat, hills, poor pacing, or harder terrain.",
      "Positive values mean the second half produced more speed per heartbeat. That can reflect warming up, conservative pacing, a stronger finish, or easier second-half conditions.",
      "The rolling 4-run line is usually more useful than a single run because per-run drift is noisy.",
    ],
    caveats: [
      "Compare like with like. Route, elevation, weather, workout type, stops, and sensor quality can move this metric.",
      "Missing values mean the run did not have enough usable segment heart-rate and speed data.",
    ],
  },
  fitnessEfficiency: {
    title: "Speed per heartbeat",
    definition:
      "Efficiency ratio is session speed in kilometers per hour divided by average heart rate. The rolling 4-run line averages the current run and previous three runs.",
    source: "dbt signal_fitness, from silver_runs speed_kmh and avg_heart_rate.",
    interpretation: [
      "Higher values mean more speed for each average heartbeat in that run.",
      "A rising rolling line can suggest improving aerobic efficiency when runs are otherwise comparable.",
      "A falling line can reflect fatigue, heat, hills, harder conditions, or less efficient pacing.",
    ],
    caveats: [
      "This is not normalized for route, weather, workout intent, or device behavior.",
      "Use it with pace-at-heart-rate and HR drift rather than reading it as a standalone fitness score.",
    ],
  },
  paceHeartRate: {
    title: "Pace at comparable heart rate",
    definition:
      "Each point is a run's average pace plotted over time, grouped by average-heart-rate band. Pace is minutes per kilometer, so lower values are faster.",
    source: "dbt signal_fitness, from silver_runs avg_pace_min_per_km and avg_heart_rate.",
    interpretation: [
      "Compare points within the same heart-rate band. Faster paces at similar average heart rate are generally favorable.",
      "The trend line summarizes the selected visible points. A downward trend means faster pace at comparable heart rate.",
      "Use the band controls to narrow the comparison when mixed-intensity runs make the chart hard to read.",
    ],
    caveats: [
      "Average heart rate hides within-run effort changes, intervals, stops, and terrain changes.",
      "The chart is directional. It does not control for weather, route grade, fatigue, or sensor noise.",
    ],
  },
} satisfies Record<string, MetricInfoContent>;

function ChartFrame({
  title,
  description,
  info,
  controls,
  children,
}: {
  title: string;
  description?: string;
  info: MetricInfoContent;
  controls?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex h-full flex-col overflow-hidden rounded-sm border border-(--border) bg-(--surface)">
      <div className="flex items-start justify-between gap-3 border-b border-(--border) px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-(--accent)">
            analysis.output
          </p>
          <h2 className="mt-1 text-base font-semibold text-(--text)">{title}</h2>
          {description ? <p className="mt-1 max-w-2xl text-sm text-(--text-soft)">{description}</p> : null}
        </div>
        <MetricInfoDialog content={info} />
      </div>
      {controls ? <div className="border-b border-(--border) px-4 py-3">{controls}</div> : null}
      <div className="h-80 min-h-80 flex-1 px-2 pt-4 pb-3 sm:px-4">{children}</div>
    </section>
  );
}

export function WeeklyVolumeChart({ weeks }: { weeks: WeekRollup[] }) {
  const volumeBreakdown = getWeeklyVolumeBreakdown(weeks);

  return (
    <ChartFrame
      title="Weekly distance and rolling volume"
      description="Weekly distance split by longest run and remaining distance."
      info={CHART_INFO.weeklyVolume}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={volumeBreakdown} margin={{ top: 8, right: 8, left: 0 }}>
          <CartesianGrid
            stroke={CHART_GRID_COLOR}
            strokeDasharray="2 5"
            vertical={false}
          />
          <XAxis
            dataKey="weekStartDate"
            tickFormatter={shortDate}
            minTickGap={28}
            axisLine={false}
            tickLine={false}
            tick={axisTick}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={axisTick}
            tickFormatter={formatKm}
          />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(value) => shortDate(String(value))}
            formatter={(value, name) => [formatKm(value), name]}
          />
          <Legend {...legendProps} />
          <Bar
            dataKey="longestRunDistanceKm"
            name="Longest run"
            stackId="distance"
            fill={PRIMARY_SERIES_COLOR}
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="otherWeeklyDistanceKm"
            name="Other distance"
            stackId="distance"
            fill={MUTED_SERIES_COLOR}
            radius={[2, 2, 0, 0]}
          />
          <Line
            type="monotone"
            dataKey="rolling4wDistanceKm"
            name="Rolling 4w distance"
            stroke={SECONDARY_SERIES_COLOR}
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function MonthlyVolumeChart({ months }: { months: MonthRollup[] }) {
  return (
    <ChartFrame
      title="Monthly volume"
      description="Calendar-month distance and run frequency."
      info={CHART_INFO.monthlyVolume}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={months} margin={{ top: 16, right: 8, left: 8 }}>
          <CartesianGrid
            stroke={CHART_GRID_COLOR}
            strokeDasharray="2 5"
            vertical={false}
          />
          <XAxis
            dataKey="monthStartDate"
            tickFormatter={formatMonthTick}
            minTickGap={28}
            axisLine={false}
            tickLine={false}
            tick={axisTick}
          />
          <YAxis
            yAxisId="left"
            axisLine={false}
            tickLine={false}
            tick={axisTick}
            tickFormatter={formatKm}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            axisLine={false}
            tickLine={false}
            tick={axisTick}
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
          <Legend {...legendProps} />
          <Bar
            yAxisId="left"
            dataKey="monthlyDistanceKm"
            name="Monthly distance"
            fill={PRIMARY_SERIES_COLOR}
            radius={[2, 2, 0, 0]}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="runsPerMonth"
            name="Runs"
            stroke={SECONDARY_SERIES_COLOR}
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function WeeklyStructureChart({ weeks }: { weeks: WeekRollup[] }) {
  const completeWeeks = getCompleteStructureWeeks(weeks);

  return (
    <ChartFrame
      title="Weekly structure"
      description="Active and missed days by completed week."
      info={CHART_INFO.weeklyStructure}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={completeWeeks} margin={{ top: 8, right: 8, left: 0 }}>
          <CartesianGrid
            stroke={CHART_GRID_COLOR}
            strokeDasharray="2 5"
            vertical={false}
          />
          <XAxis
            dataKey="weekStartDate"
            tickFormatter={shortDate}
            minTickGap={28}
            axisLine={false}
            tickLine={false}
            tick={axisTick}
          />
          <YAxis
            yAxisId="left"
            domain={[0, 7]}
            axisLine={false}
            tickLine={false}
            tick={axisTick}
            tickFormatter={formatDays}
          />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(value) => shortDate(String(value))}
            formatter={(value, name) => [formatDays(value), name]}
          />
          <Legend {...legendProps} />
          <Bar
            yAxisId="left"
            dataKey="activeDays"
            name="Active days"
            stackId="days"
            fill={PRIMARY_SERIES_COLOR}
            radius={[0, 0, 0, 0]}
          />
          <Bar
            yAxisId="left"
            dataKey="missedDays"
            name="Missed days"
            stackId="days"
            fill={MUTED_SERIES_COLOR}
            radius={[2, 2, 0, 0]}
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
      info={CHART_INFO.hrDrift}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, left: 0 }}>
          <CartesianGrid
            stroke={CHART_GRID_COLOR}
            strokeDasharray="2 5"
            vertical={false}
          />
          <XAxis
            dataKey="activityDate"
            tickFormatter={shortDate}
            minTickGap={28}
            axisLine={false}
            tickLine={false}
            tick={axisTick}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={axisTick}
            tickFormatter={formatSignedPercentValue}
          />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(value) => shortDate(String(value))}
            formatter={(value, name) => [formatSignedPercentValue(value), name]}
          />
          <Legend
            content={
              <FitnessLineLegend
                sessionLabel="Session HR drift (thin)"
                rollingLabel="Rolling 4-run HR drift (thick)"
              />
            }
          />
          <ReferenceLine y={0} stroke={CHART_GRID_COLOR} strokeDasharray="3 4" />
          <Line
            type="monotone"
            dataKey="hrDriftPct"
            name="Session HR drift"
            stroke={PRIMARY_SERIES_COLOR}
            strokeWidth={1.5}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="rolling4RunHrDriftPct"
            name="Rolling 4-run HR drift"
            stroke={SECONDARY_SERIES_COLOR}
            strokeWidth={3}
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
      info={CHART_INFO.fitnessEfficiency}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, left: 0 }}>
          <CartesianGrid
            stroke={CHART_GRID_COLOR}
            strokeDasharray="2 5"
            vertical={false}
          />
          <XAxis
            dataKey="activityDate"
            tickFormatter={shortDate}
            minTickGap={28}
            axisLine={false}
            tickLine={false}
            tick={axisTick}
          />
          <YAxis
            domain={efficiencyDomain}
            axisLine={false}
            tickLine={false}
            tick={axisTick}
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
          <Legend
            content={
              <FitnessLineLegend
                sessionLabel="Session efficiency (thin)"
                rollingLabel="Rolling 4-run efficiency (thick)"
              />
            }
          />
          <Line
            type="monotone"
            dataKey="efficiencyRatio"
            name="Session efficiency"
            stroke={PRIMARY_SERIES_COLOR}
            strokeWidth={1.5}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="rolling4RunEfficiencyRatio"
            name="Rolling 4-run efficiency"
            stroke={SECONDARY_SERIES_COLOR}
            strokeWidth={3}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function PaceHeartRateTrend({ points }: { points: FitnessPoint[] }) {
  const [selectedHeartRateBandIds, setSelectedHeartRateBandIds] = useState<string[]>([]);
  const data = useMemo<PaceHeartRateChartPoint[]>(
    () =>
      points.filter(hasPaceHeartRate).map((point) => ({
        ...point,
        activityDateTimestamp: getActivityDateTimestamp(point.activityDate),
      })),
    [points],
  );
  const heartRateBands = useMemo(() => getHeartRateBands(data), [data]);
  const selectedHeartRateBandIdSet = useMemo(
    () => new Set(selectedHeartRateBandIds),
    [selectedHeartRateBandIds],
  );
  const visibleHeartRateBands = useMemo(
    () =>
      selectedHeartRateBandIds.length === 0
        ? heartRateBands
        : heartRateBands.filter((band) => selectedHeartRateBandIdSet.has(band.id)),
    [heartRateBands, selectedHeartRateBandIdSet, selectedHeartRateBandIds.length],
  );
  const bandColorById = useMemo(
    () => new Map(heartRateBands.map((band, index) => [band.id, getBandColor(index)])),
    [heartRateBands],
  );
  const bandSeries = useMemo(
    () =>
      visibleHeartRateBands.map((band) => ({
        band,
        color: bandColorById.get(band.id) ?? getBandColor(0),
        data: data.filter(
          (point) => point.avgHeartRate >= band.min && point.avgHeartRate < band.max,
        ),
      })),
    [bandColorById, data, visibleHeartRateBands],
  );
  const visibleData = useMemo(
    () => bandSeries.flatMap((series) => series.data),
    [bandSeries],
  );
  const trendData = useMemo(() => getLinearPaceTrend(visibleData), [visibleData]);
  const dateTicks = useMemo(() => getPaceHeartRateDateTicks(visibleData), [visibleData]);
  const paceDomain = useMemo(() => getPaceDomain(visibleData), [visibleData]);
  const toggleHeartRateBand = (bandId: string) => {
    setSelectedHeartRateBandIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(bandId)) {
        nextIds.delete(bandId);
      } else {
        nextIds.add(bandId);
      }

      return heartRateBands.filter((band) => nextIds.has(band.id)).map((band) => band.id);
    });
  };
  const controls = heartRateBands.length > 1 && (
    <div className="overflow-x-auto">
      <div
        className="flex w-max min-w-full items-center justify-center gap-1.5"
        role="group"
        aria-label="Average heart rate range"
      >
        {heartRateBands.map((band) => (
          <button
            key={band.id}
            type="button"
            aria-pressed={selectedHeartRateBandIdSet.has(band.id)}
            className={heartRateBandButtonClass(selectedHeartRateBandIdSet.has(band.id))}
            onClick={() => toggleHeartRateBand(band.id)}
          >
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: bandColorById.get(band.id) ?? getBandColor(0) }}
              aria-hidden="true"
            />
            {band.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <ChartFrame
      title="Pace at comparable heart rate"
      description="Run pace over time within selected average-heart-rate bands."
      info={CHART_INFO.paceHeartRate}
      controls={controls}
    >
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={visibleData} margin={{ top: 8, right: 8, left: 0 }}>
              <CartesianGrid
                stroke={CHART_GRID_COLOR}
                strokeDasharray="2 5"
                vertical={false}
              />
              <XAxis
                dataKey="activityDateTimestamp"
                name="Date"
                type="number"
                scale="time"
                domain={visibleData.length > 0 ? ["dataMin", "dataMax"] : [0, 1]}
                ticks={dateTicks}
                tickFormatter={formatTimestampTick}
                minTickGap={28}
                axisLine={false}
                tickLine={false}
                tick={axisTick}
              />
              <YAxis
                type="number"
                domain={paceDomain}
                dataKey="avgPaceMinPerKm"
                name="Pace"
                reversed
                axisLine={false}
                tickLine={false}
                tick={axisTick}
                tickFormatter={formatPaceValue}
              />
              <Tooltip
                {...tooltipStyle}
                labelFormatter={formatTimestampLabel}
                formatter={(value, name) => [
                  name === "Date" ? formatTimestampLabel(value) : formatPaceValue(value),
                  name,
                ]}
              />
              {bandSeries.map((series) => (
                <Scatter
                  key={`${series.band.id}-runs`}
                  data={series.data}
                  name={`${series.band.label} bpm`}
                  fill={series.color}
                  line={false}
                />
              ))}
              {trendData.length > 0 ? (
                <Line
                  data={trendData}
                  type="linear"
                  dataKey="trendPaceMinPerKm"
                  name="Trend"
                  stroke="var(--text-soft)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={false}
                />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {trendData.length > 0 ? (
          <div className="mt-1 flex items-center justify-center gap-1.5 text-[11px] leading-4 text-(--text-soft)">
            <span
              className="h-0.5 w-5 rounded-full bg-(--text-soft)"
              aria-hidden="true"
            />
            <span>Trend</span>
          </div>
        ) : null}
      </div>
    </ChartFrame>
  );
}
