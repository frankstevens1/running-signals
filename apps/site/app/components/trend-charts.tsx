"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  Cell,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useDistanceUnit } from "@/app/components/distance-unit-provider";
import {
  distanceFromKm,
  paceFromMinPerKm,
  speedFromKmh,
  type DistanceUnit,
} from "@/app/lib/distance-unit";
import {
  formatDate,
  formatDistance,
  formatDuration,
  formatPace,
  formatSignedPercent,
  shortDate,
} from "@/app/lib/format";
import {
  buildRecoveryTrendPoints,
  getRecoveryPointsWithinDays,
  getRecoveryTrendSummary,
  recoveryDateTimestamp,
  RECOVERY_BASELINE_MIN_OBSERVATIONS,
  type RecoveryTrendPoint,
} from "@/app/lib/recovery-trend";
import type { FitnessPoint, MonthRollup, WeekRollup } from "@/app/lib/types";
import {
  MetricInfoDialog,
  type MetricInfoContent,
} from "@/app/components/metric-info-dialog";

type NumericDomain = [number, number];
type PaceHeartRatePoint = FitnessPoint & {
  avgHeartRate: number;
  avgPaceMinPerKm: number;
  distanceKm: number;
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
type WeeklyStructureDatum = WeekRollup & {
  avgRunDistanceKm: number | null;
};
type EfficiencyRatioSourcePoint = FitnessPoint & {
  avgHeartRate: number;
  distanceKm: number;
  efficiencyRatio: number;
  speedKmh: number;
};
type EfficiencyRatioPoint = EfficiencyRatioSourcePoint & {
  efficiencyPer10Bpm: number;
  rollingEfficiencyPer10Bpm: number | null;
};
type AerobicDecouplingPoint = FitnessPoint & {
  activityDateTimestamp: number;
  aerobicDecouplingPct: number;
  avgHeartRate: number;
  distanceKm: number;
  firstHalfAvgHeartRate: number;
  firstHalfEfficiencyRatio: number;
  firstHalfSpeedKmh: number;
  secondHalfAvgHeartRate: number;
  secondHalfEfficiencyRatio: number;
  secondHalfSpeedKmh: number;
};
type DistanceGroup = "all" | "short" | "medium" | "long";

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
const SIGNAL_OK_COLOR = "var(--signal-ok)";
const SIGNAL_ERROR_COLOR = "var(--signal-error)";
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
    <span className="font-mono text-text-soft">{value}</span>
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

function formatDistanceValue(value: unknown, unit: DistanceUnit) {
  const parsed = numberValue(value);
  return parsed === null ? "n/a" : `${distanceFromKm(parsed, unit).toFixed(1)} ${unit}`;
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

function formatPaceValue(value: unknown, unit: DistanceUnit) {
  const parsed = numberValue(value);
  return parsed === null ? "n/a" : formatPace(parsed, unit);
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

function PaceHeartRateTooltip({
  active,
  payload,
  unit,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{
    payload?: PaceHeartRateChartPoint | PaceHeartRateTrendPoint;
  }>;
  unit: DistanceUnit;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload
    .map((item) => item.payload)
    .find(
      (entry): entry is PaceHeartRateChartPoint =>
        entry !== undefined
        && "avgHeartRate" in entry
        && Number.isFinite(entry.avgHeartRate)
        && "avgPaceMinPerKm" in entry
        && Number.isFinite(entry.avgPaceMinPerKm),
    );
  if (!point) return null;

  return (
    <div style={tooltipStyle.contentStyle}>
      <div style={tooltipStyle.labelStyle}>
        {formatTimestampLabel(point.activityDateTimestamp)}
      </div>
      <div style={tooltipStyle.itemStyle}>
        Pace: {formatPaceValue(point.avgPaceMinPerKm, unit)}
      </div>
      <div style={tooltipStyle.itemStyle}>
        Avg HR: {Math.round(point.avgHeartRate)} bpm
      </div>
      <div style={tooltipStyle.itemStyle}>
        Distance: {formatDistanceValue(point.distanceKm, unit)}
      </div>
      <div style={tooltipStyle.itemStyle}>
        HR bucket: {heartRateBandLabel(point.avgHeartRate)} bpm
      </div>
    </div>
  );
}

function hasPaceHeartRate(point: FitnessPoint): point is PaceHeartRatePoint {
  return (
    Number.isFinite(getActivityDateTimestamp(point.activityDate)) &&
    point.avgHeartRate !== null &&
    Number.isFinite(point.avgHeartRate) &&
    point.avgPaceMinPerKm !== null &&
    Number.isFinite(point.avgPaceMinPerKm) &&
    point.distanceKm !== null &&
    Number.isFinite(point.distanceKm)
  );
}

function getHeartRateBands(points: Array<{ avgHeartRate: number }>): HeartRateBand[] {
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
    "comparable-filter-button inline-flex h-[21px] shrink-0 items-center justify-center gap-1 whitespace-nowrap border px-[5px] font-mono font-medium leading-none transition-colors sm:px-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-2 focus-visible:ring-offset-(--surface)";

  return isSelected
    ? `${base} border-accent bg-accent-soft text-accent-strong`
    : `${base} border-border bg-surface text-text-soft hover:border-accent hover:text-text`;
}

function FitnessLineLegend({
  sessionLabel,
  rollingLabel,
}: {
  sessionLabel: string;
  rollingLabel: string;
}) {
  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-1 font-mono text-[11px] leading-4 text-text-soft">
      <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
        <span
          className="w-5 shrink-0"
          style={{ backgroundColor: PRIMARY_SERIES_COLOR, height: 1.5 }}
          aria-hidden="true"
        />
        <span className="min-w-0">{sessionLabel}</span>
      </span>
      <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
        <span
          className="w-5 shrink-0"
          style={{ backgroundColor: SECONDARY_SERIES_COLOR, height: 3 }}
          aria-hidden="true"
        />
        <span className="min-w-0">{rollingLabel}</span>
      </span>
    </div>
  );
}

function RecoveryLegend({
  latestClassification,
}: {
  latestClassification: RecoveryTrendPoint["recoveryClassification"] | undefined;
}) {
  const latestColor = latestClassification === undefined
    ? MUTED_SERIES_COLOR
    : recoveryClassificationColor(latestClassification);

  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-1 font-mono text-[11px] leading-4 text-text-soft">
      <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
        <span
          className="size-2 shrink-0"
          style={{ backgroundColor: MUTED_SERIES_COLOR }}
          aria-hidden="true"
        />
        <span className="min-w-0">Comparable readings</span>
      </span>
      <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
        <span
          className="size-2 shrink-0 border"
          style={{ backgroundColor: latestColor, borderColor: "var(--surface)" }}
          aria-hidden="true"
        />
        <span className="min-w-0">Latest reading</span>
      </span>
    </div>
  );
}

function getBandColor(index: number) {
  return BAND_SERIES_COLORS[index % BAND_SERIES_COLORS.length];
}

function getHeartRateBandId(heartRate: number): string {
  const min = Math.floor(heartRate / HEART_RATE_BAND_SIZE_BPM) * HEART_RATE_BAND_SIZE_BPM;
  return `${min}-${min + HEART_RATE_BAND_SIZE_BPM}`;
}

function heartRateBandLabel(heartRate: number): string {
  const min = Math.floor(heartRate / HEART_RATE_BAND_SIZE_BPM) * HEART_RATE_BAND_SIZE_BPM;
  return `${min}-${min + HEART_RATE_BAND_SIZE_BPM - 1}`;
}

function nextContiguousHeartRateBandIds(
  currentIds: string[],
  bandId: string,
  heartRateBands: HeartRateBand[],
): string[] {
  const selectedIndices = heartRateBands
    .map((band, index) => (currentIds.includes(band.id) ? index : -1))
    .filter((index) => index >= 0);
  const targetIndex = heartRateBands.findIndex((band) => band.id === bandId);

  if (targetIndex < 0) return [];
  if (selectedIndices.length === 0) return [bandId];

  const firstIndex = selectedIndices[0];
  const lastIndex = selectedIndices.at(-1) ?? firstIndex;

  if (selectedIndices.includes(targetIndex)) {
    if (selectedIndices.length === 1) return [];
    if (targetIndex === firstIndex) {
      return heartRateBands.slice(firstIndex + 1, lastIndex + 1).map((band) => band.id);
    }
    if (targetIndex === lastIndex) {
      return heartRateBands.slice(firstIndex, lastIndex).map((band) => band.id);
    }

    return [bandId];
  }

  if (targetIndex === firstIndex - 1 || targetIndex === lastIndex + 1) {
    const rangeStart = Math.min(firstIndex, targetIndex);
    const rangeEnd = Math.max(lastIndex, targetIndex);
    return heartRateBands.slice(rangeStart, rangeEnd + 1).map((band) => band.id);
  }

  return [bandId];
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

function getUniformDateTicks(points: Array<{ activityDateTimestamp: number }>): number[] {
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

function getEfficiencyDomain(points: EfficiencyRatioPoint[]): NumericDomain {
  const values = points
    .flatMap((point) => [point.efficiencyPer10Bpm, point.rollingEfficiencyPer10Bpm])
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (values.length === 0) {
    return [0, 1];
  }

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    const padding = Math.max(Math.abs(min) * 0.08, 0.05);
    return [Math.max(0, min - padding), max + padding];
  }

  const padding = Math.max((max - min) * 0.15, 0.02);
  return [Math.max(0, min - padding), max + padding];
}

function getRecoveryHeartRateDomain(points: RecoveryTrendPoint[]): NumericDomain {
  const values = points
    .flatMap((point) => [
      point.garminRecoveryHr,
      point.recoveryPrior90dMedian,
      point.recoveryPrior90dQ1,
      point.recoveryPrior90dQ3,
    ])
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (values.length === 0) return [0, 30];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max((max - min) * 0.2, 3);
  return [Math.max(0, min - padding), max + padding];
}

function getCompleteStructureWeeks(weeks: WeekRollup[]): WeeklyStructureDatum[] {
  return weeks.map((week) => ({ ...week, avgRunDistanceKm: week.avgRunDistanceKm }));
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
      "Active days are completed calendar days with at least one run. Missed days are completed calendar days with no run. Average run distance divides weekly distance by runs in each completed week. The chart shows completed weeks where the active and missed day counts add to seven.",
    source:
      "dbt mart_weeks, using mart_days activity flags, weekly distance, and run count.",
    interpretation: [
      "More active days means higher run frequency in that completed week.",
      "The average-distance line distinguishes weeks built from longer runs from weeks built from shorter runs.",
      "Missed days are non-run days, not failures. Rest days, cross-training, travel, and planned breaks all appear as missed run days.",
      "Look for consistency patterns across several weeks rather than treating one week as decisive.",
    ],
    caveats: [
      "This chart measures running regularity only. It does not know whether non-run days were planned recovery or other training.",
      "Weeks with no runs have no average run distance.",
    ],
  },
  aerobicDecoupling: {
    title: "Aerobic decoupling",
    definition:
      "Aerobic decoupling compares moving-time-weighted speed-to-heart-rate efficiency between exact cumulative-distance halves of a run. It is first-half efficiency divided by second-half efficiency minus one, so positive values mean lower second-half efficiency.",
    source: "dbt mart_run_aerobic_decoupling and mart_fitness, using record-level moving intervals and canonical 250 m segment quality checks.",
    interpretation: [
      "Near 0% means second-half efficiency was similar to first-half efficiency.",
      "Positive values mean lower second-half efficiency. This can reflect fatigue, heat, hills, poor pacing, or harder terrain.",
      "Negative values mean higher second-half efficiency, which can reflect warming up, a stronger finish, or easier second-half conditions.",
      "The 90-day baseline is available only after four prior eligible runs. Use comparable-run filters before interpreting it.",
    ],
    caveats: [
      "Compare like with like. Route, elevation, weather, workout type, and pacing can move this metric.",
      "Runs must pass moving-time, distance, segment, heart-rate coverage, and sampling-gap checks before they are eligible.",
    ],
  },
  fitnessEfficiency: {
    title: "Speed-to-HR ratio",
    definition:
      "The speed-to-HR ratio is session speed in kilometers per hour divided by average heart rate. The chart displays the equivalent speed per 10 beats per minute. The rolling 4-run line averages the current run and previous three runs.",
    source: "dbt mart_fitness, from runs speed_kmh and avg_heart_rate.",
    interpretation: [
      "Higher values mean more speed at a given average heart rate in that run.",
      "A rising rolling line across comparable runs can suggest improving aerobic efficiency.",
      "A falling line can reflect fatigue, heat, hills, harder conditions, or less efficient pacing.",
    ],
    caveats: [
      "This is not normalized for route, weather, workout intent, or device behavior.",
      "Use it with pace-at-heart-rate and aerobic decoupling rather than reading it as a standalone fitness score.",
    ],
  },
  recoveryHeartRate: {
    title: "Post-run recovery response",
    definition:
      "Recovery heart rate is the drop from the final recorded run heart rate to Garmin's recovery reading, usually about two minutes later. The top comparison places the latest reading against the prior 90 days of runs that finished in the same 10-bpm heart-rate range; the latest run is excluded from that baseline.",
    source: "dbt mart_fitness, from Garmin recovery heart-rate events.",
    interpretation: [
      "The shaded range is the middle half of prior comparable readings; the tick is their median. The coloured dot is the latest recovery drop relative to that reference.",
      "The lower strip shows all comparable readings from the last 90 days in run order. The rightmost dot is the latest run; older dots are neutral evidence, not judgments.",
      "A baseline needs at least four prior comparable readings. Without that sample, the chart shows the reading but does not classify it.",
    ],
    caveats: [
      "The drop can change with how a run ends, heat, fatigue, hydration, sensor quality, and measurement timing.",
      "A larger drop is generally favourable, but this is descriptive context, not a readiness or fitness diagnosis.",
    ],
  },
  paceHeartRate: {
    title: "Pace at comparable heart rate",
    definition:
      "Each point is a run's average pace plotted over time, grouped by average-heart-rate band. Pace is minutes per kilometer, so lower values are faster.",
    source: "dbt mart_fitness, from runs avg_pace_min_per_km and avg_heart_rate.",
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
  distanceEconomy: {
    title: "Distance economy over time",
    definition:
      "Distance economy is total horizontal distance in metres divided by total heartbeats during the run. Total heartbeats are computed by integrating heart rate over per-second telemetry: \u03a3(HR(t) \u00d7 \u0394t / 60). Higher values mean more distance covered for the same cardiovascular effort.",
    source: "dbt mart_fitness, from mart_activity_records heart_rate and record_distance_m.",
    interpretation: [
      "Higher values mean more distance travelled per heartbeat \u2014 improved aerobic efficiency.",
      "A rising trend across comparable runs suggests improving cardiovascular fitness.",
      "Compare runs of similar distance and terrain; economy varies naturally with pace and route profile.",
    ],
    caveats: [
      "Not normalized for route, weather, workout type, or terrain.",
      "Values are null when the run has no usable heart-rate telemetry.",
    ],
  },
  elevationEconomy: {
    title: "Elevation economy over time",
    definition:
      "Elevation economy is total elevation gain in metres divided by total heartbeats during the run. Only positive altitude changes are counted. The background bars show total ascent per run for context \u2014 economy naturally varies with how much climbing the run includes.",
    source: "dbt mart_fitness, from mart_activity_records heart_rate and altitude_delta_m.",
    interpretation: [
      "Higher values mean more climbing per heartbeat \u2014 improved climbing efficiency.",
      "Compare runs with similar ascent (similar bar heights). A rising line for comparable elevation gain suggests better climbing fitness.",
      "Flat runs will show near-zero economy. That is expected and not a negative signal.",
    ],
    caveats: [
      "Heavily terrain-dependent. Best interpreted alongside the ascent bars for context.",
      "Values are null when the run has no usable heart-rate or altitude telemetry.",
    ],
  },
  efficiencyScore: {
    title: "Personal efficiency score",
    definition:
      "Personal efficiency score compares observed distance economy against the runner's 90-day trailing personal baseline: 100 \u00d7 observed / expected. 100 equals typical performance. Above 100 means better-than-expected efficiency; below 100 means less efficient than the recent norm.",
    source: "dbt mart_fitness, computed from distance_economy_m_per_beat with a 90-day trailing average window (current run excluded).",
    interpretation: [
      "A score above 100 means you were more efficient than your recent typical performance.",
      "A score below 100 means less efficient \u2014 this may reflect fatigue, heat, hills, or deliberate easy effort.",
      "Trend matters more than individual scores. Look for sustained periods above or below 100.",
    ],
    caveats: [
      "Requires at least three qualifying runs in the prior 90 days. Without enough history the score is null.",
      "Score below 100 does not mean a bad run \u2014 it means less efficient than your recent norm, which may be intentional.",
    ],
  },
} satisfies Record<string, MetricInfoContent>;

function ChartFrame({
  title,
  description,
  info,
  controls,
  contentClassName,
  descriptionClassName,
  children,
}: {
  title: string;
  description?: string;
  info: MetricInfoContent;
  controls?: ReactNode;
  contentClassName?: string;
  descriptionClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex h-full w-full min-w-0 max-w-full flex-col overflow-hidden border border-border bg-surface">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-accent">
            analysis.output
          </p>
          <h2 className="mt-1 text-base font-semibold text-text">{title}</h2>
          {description ? <p className={`mt-1 max-w-2xl text-sm text-text-soft ${descriptionClassName ?? ""}`}>{description}</p> : null}
        </div>
        <MetricInfoDialog content={info} />
      </div>
      {controls ? <div className="min-w-0 max-w-full border-b border-border px-4 py-3">{controls}</div> : null}
      <div className={`${contentClassName ?? "h-80 min-h-80"} w-full min-w-0 max-w-full flex-1 overflow-hidden px-2 pt-4 pb-3 sm:px-4`}>{children}</div>
    </section>
  );
}

export function WeeklyVolumeChart({ weeks }: { weeks: WeekRollup[] }) {
  const { unit } = useDistanceUnit();
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
            tickFormatter={(value) => formatDistanceValue(value, unit)}
          />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(value) => shortDate(String(value))}
            formatter={(value, name) => [formatDistanceValue(value, unit), name]}
          />
          <Legend {...legendProps} />
          <Bar
            dataKey="longestRunDistanceKm"
            name="Longest run"
            stackId="distance"
            fill={PRIMARY_SERIES_COLOR}
          />
          <Bar
            dataKey="otherWeeklyDistanceKm"
            name="Other distance"
            stackId="distance"
            fill={MUTED_SERIES_COLOR}
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
  const { unit } = useDistanceUnit();
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
            tickFormatter={(value) => formatDistanceValue(value, unit)}
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
              name === "Runs" ? formatRuns(value) : formatDistanceValue(value, unit),
              name,
            ]}
          />
          <Legend {...legendProps} />
          <Bar
            yAxisId="left"
            dataKey="monthlyDistanceKm"
            name="Monthly distance"
            fill={PRIMARY_SERIES_COLOR}
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
  const { unit } = useDistanceUnit();
  const completeWeeks = getCompleteStructureWeeks(weeks);

  return (
    <ChartFrame
      title="Weekly structure"
      description="Active and missed days with average run distance by completed week."
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
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, "auto"]}
            axisLine={false}
            tickLine={false}
            tick={axisTick}
            tickFormatter={(value) => formatDistanceValue(value, unit)}
          />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(value) => shortDate(String(value))}
            formatter={(value, name) => [
              name === "Avg run distance"
                ? formatDistanceValue(value, unit)
                : formatDays(value),
              name,
            ]}
          />
          <Legend {...legendProps} />
          <Bar
            yAxisId="left"
            dataKey="activeDays"
            name="Active days"
            stackId="days"
            fill={PRIMARY_SERIES_COLOR}
          />
          <Bar
            yAxisId="left"
            dataKey="missedDays"
            name="Missed days"
            stackId="days"
            fill={MUTED_SERIES_COLOR}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="avgRunDistanceKm"
            name="Avg run distance"
            stroke={SECONDARY_SERIES_COLOR}
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

function hasAerobicDecoupling(point: FitnessPoint): point is AerobicDecouplingPoint {
  return point.aerobicDecouplingStatus === "eligible"
    && point.aerobicDecouplingPct !== null
    && Number.isFinite(point.aerobicDecouplingPct)
    && point.distanceKm !== null
    && Number.isFinite(point.distanceKm)
    && point.avgHeartRate !== null
    && Number.isFinite(point.avgHeartRate)
    && point.firstHalfSpeedKmh !== null
    && Number.isFinite(point.firstHalfSpeedKmh)
    && point.secondHalfSpeedKmh !== null
    && Number.isFinite(point.secondHalfSpeedKmh)
    && point.firstHalfAvgHeartRate !== null
    && Number.isFinite(point.firstHalfAvgHeartRate)
    && point.secondHalfAvgHeartRate !== null
    && Number.isFinite(point.secondHalfAvgHeartRate)
    && point.firstHalfEfficiencyRatio !== null
    && Number.isFinite(point.firstHalfEfficiencyRatio)
    && point.secondHalfEfficiencyRatio !== null
    && Number.isFinite(point.secondHalfEfficiencyRatio);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
    : sorted[midpoint];
}

function quantile(values: number[], percentile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * percentile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function getAerobicDecouplingDomain(
  points: AerobicDecouplingPoint[],
  q1: number | null,
  q3: number | null,
): NumericDomain {
  const values = points
    .map((point) => point.aerobicDecouplingPct)
    .concat(q1 ?? [], q3 ?? [], 0)
    .filter(Number.isFinite);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const padding = Math.max((maximum - minimum) * 0.15, 0.02);
  return [minimum - padding, maximum + padding];
}

function formatHalfEfficiency(value: number, unit: DistanceUnit): string {
  return formatEfficiencyRatio(speedFromKmh(value, unit) * 10, unit);
}

function aerobicDecouplingCallout(value: number): string {
  if (value < -0.01) return "Second-half efficiency higher";
  if (value <= 0.01) return "Stable across both halves";
  if (value <= 0.05) return "Small second-half drop";
  if (value <= 0.1) return "Moderate second-half drop";
  return "Large second-half drop";
}

function aerobicDecouplingClassification(value: number) {
  if (value <= 0.05) {
    return {
      label: "Low decoupling",
      color: SIGNAL_OK_COLOR,
      textClassName: "text-signal-ok",
    };
  }
  if (value <= 0.1) {
    return {
      label: "Moderate decoupling",
      color: "var(--signal-warn)",
      textClassName: "text-signal-warn",
    };
  }
  return {
    label: "High decoupling",
    color: SIGNAL_ERROR_COLOR,
    textClassName: "text-signal-error",
  };
}

function unavailableReasonLabel(reason: string | null): string {
  switch (reason) {
    case "missing_moving_telemetry": return "The run did not contain enough moving telemetry.";
    case "insufficient_moving_duration": return "Less than 20 minutes of moving time.";
    case "insufficient_moving_distance": return "Less than 5 km of moving distance.";
    case "insufficient_valid_segments": return "Fewer than 8 valid 250 m segments.";
    case "insufficient_hr_coverage": return "Heart-rate coverage was below the required threshold.";
    case "excessive_hr_gap": return "A moving-time heart-rate gap exceeded 30 seconds.";
    case "missing_half_heart_rate": return "One half of the run lacked usable heart-rate data.";
    case "invalid_half_speed": return "One half of the run lacked usable moving-speed data.";
    default: return "No eligible aerobic-decoupling reading is available.";
  }
}

function AerobicDecouplingTooltip({
  active,
  payload,
  unit,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: AerobicDecouplingPoint }>;
  unit: DistanceUnit;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload.map((item) => item.payload).find(Boolean);
  if (!point) return null;
  const classification = aerobicDecouplingClassification(point.aerobicDecouplingPct);

  return (
    <div style={tooltipStyle.contentStyle}>
      <div style={tooltipStyle.labelStyle}>{formatDate(point.activityDate)}</div>
      <div style={tooltipStyle.itemStyle}>
        Decoupling: {formatSignedPercent(point.aerobicDecouplingPct)}
      </div>
      <div style={{ ...tooltipStyle.itemStyle, color: classification.color }}>
        {classification.label}
      </div>
      <div style={tooltipStyle.itemStyle}>
        First half: {speedFromKmh(point.firstHalfSpeedKmh, unit).toFixed(1)} {unit}/h, {Math.round(point.firstHalfAvgHeartRate)} bpm
      </div>
      <div style={tooltipStyle.itemStyle}>
        Second half: {speedFromKmh(point.secondHalfSpeedKmh, unit).toFixed(1)} {unit}/h, {Math.round(point.secondHalfAvgHeartRate)} bpm
      </div>
      <div style={tooltipStyle.itemStyle}>
        Moving time: {formatDuration(point.aerobicDecouplingMovingDurationSeconds)}
      </div>
      <div style={tooltipStyle.itemStyle}>
        Valid segments: {point.aerobicDecouplingValidSegmentCount ?? "n/a"}
      </div>
      <div style={tooltipStyle.itemStyle}>
        HR coverage: {point.aerobicDecouplingHrCoverageRatio != null
          ? formatSignedPercent(point.aerobicDecouplingHrCoverageRatio).replace("+", "")
          : "n/a"}
      </div>
    </div>
  );
}

function AerobicDecouplingComparison({
  point,
  unit,
  unavailableReason,
  heading,
}: {
  point: AerobicDecouplingPoint | null;
  unit: DistanceUnit;
  unavailableReason: string | null;
  heading: string;
}) {
  if (!point) {
    return (
      <AerobicDecouplingUnavailableReason reason={unavailableReason} className="h-full" />
    );
  }

  return (
    <div className="flex h-full flex-col border border-border bg-surface-muted">
      <AerobicDecouplingSummary point={point} unit={unit} heading={heading} showMeaning={false} />
      <AerobicDecouplingHalfDetails point={point} unit={unit} className="flex-1" />
      <AerobicDecouplingOutcome point={point} unit={unit} />
    </div>
  );
}

function AerobicDecouplingUnavailableReason({
  reason,
  className,
}: {
  reason: string | null;
  className?: string;
}) {
  return (
    <div className={`border border-dashed border-border bg-surface-muted px-4 py-3 font-mono text-xs leading-5 text-text-soft ${className ?? ""}`}>
      {unavailableReasonLabel(reason)}
    </div>
  );
}

function AerobicDecouplingSummary({
  point,
  unit,
  heading = "Latest eligible run",
  showMeaning = true,
  showDivider = true,
}: {
  point: AerobicDecouplingPoint;
  unit: DistanceUnit;
  heading?: string;
  showMeaning?: boolean;
  showDivider?: boolean;
}) {
  const classification = aerobicDecouplingClassification(point.aerobicDecouplingPct);

  return (
    <div className={`grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 px-4 py-3 ${showDivider ? "border-b border-border" : ""}`}>
      <div>
        <p className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.12em] text-accent">
          {heading}
        </p>
        <p className="mt-0.5 text-sm text-text-soft">
          {formatDate(point.activityDate)} · {formatDistance(point.distanceKm, unit)}
        </p>
      </div>
      <div className="text-right">
        <p className={`font-mono text-lg ${classification.textClassName}`}>{formatSignedPercent(point.aerobicDecouplingPct)}</p>
        {showMeaning ? <p className="text-xs text-text-soft">{aerobicDecouplingCallout(point.aerobicDecouplingPct)}</p> : null}
      </div>
    </div>
  );
}

function AerobicDecouplingHalfDetails({
  point,
  unit,
  className,
}: {
  point: AerobicDecouplingPoint;
  unit: DistanceUnit;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-2 divide-x divide-border ${className ?? ""}`}>
      <AerobicDecouplingHalf
        label="First half"
        speedKmh={point.firstHalfSpeedKmh}
        avgHeartRate={point.firstHalfAvgHeartRate}
        efficiencyRatio={point.firstHalfEfficiencyRatio}
        unit={unit}
      />
      <AerobicDecouplingHalf
        label="Second half"
        speedKmh={point.secondHalfSpeedKmh}
        avgHeartRate={point.secondHalfAvgHeartRate}
        efficiencyRatio={point.secondHalfEfficiencyRatio}
        unit={unit}
      />
    </div>
  );
}

function AerobicDecouplingHalf({
  label,
  speedKmh,
  avgHeartRate,
  efficiencyRatio,
  unit,
}: {
  label: string;
  speedKmh: number;
  avgHeartRate: number;
  efficiencyRatio: number;
  unit: DistanceUnit;
}) {
  return (
    <div className="h-full px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-text-soft">{label}</p>
      <p className="mt-1 font-mono text-sm text-text">{formatPace(60 / speedKmh, unit)}</p>
      <dl className="mt-3 space-y-1.5 font-mono text-[10px] leading-4 text-text-soft">
        <div>
          <dt>Speed</dt>
          <dd className="text-xs text-text">{speedFromKmh(speedKmh, unit).toFixed(1)} {unit}/h</dd>
        </div>
        <div>
          <dt>Avg HR</dt>
          <dd className="text-xs text-text">{Math.round(avgHeartRate)} bpm</dd>
        </div>
        <div>
          <dt>Efficiency</dt>
          <dd className="text-[10px] leading-4 text-text">{formatHalfEfficiency(efficiencyRatio, unit)}</dd>
        </div>
      </dl>
    </div>
  );
}

function formatHalfPaceDifference(point: AerobicDecouplingPoint, unit: DistanceUnit): string {
  const paceDifference = 60 / point.secondHalfSpeedKmh - 60 / point.firstHalfSpeedKmh;
  const seconds = Math.round(Math.abs(paceFromMinPerKm(paceDifference, unit) * 60));
  if (seconds === 0) return "same as first half";
  return `${seconds}s ${paceDifference > 0 ? "slower" : "faster"} than first half`;
}

function AerobicDecouplingOutcome({
  point,
  unit,
}: {
  point: AerobicDecouplingPoint;
  unit: DistanceUnit;
}) {
  const classification = aerobicDecouplingClassification(point.aerobicDecouplingPct);

  return (
    <div className="space-y-3 border-t border-border px-4 py-3">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-text-soft">Efficiency reading</p>
        <p className={`mt-0.5 pl-2 whitespace-nowrap text-xs leading-4 ${classification.textClassName}`}>
          {aerobicDecouplingCallout(point.aerobicDecouplingPct)}
        </p>
      </div>
      <div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-text-soft">Pace shift</p>
        <p className="mt-0.5 pl-2 text-xs leading-4 text-text">{formatHalfPaceDifference(point, unit)}</p>
      </div>
    </div>
  );
}

function AerobicDecouplingMobileEvidence({
  point,
  unit,
}: {
  point: AerobicDecouplingPoint | null;
  unit: DistanceUnit;
}) {
  if (!point) return null;

  return (
    <details className="border border-border bg-surface-muted xl:hidden">
      <summary className="cursor-pointer px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-text-soft">
        First and second-half evidence
      </summary>
      <AerobicDecouplingHalfDetails point={point} unit={unit} />
    </details>
  );
}

export function AerobicDecouplingChart({ points }: { points: FitnessPoint[] }) {
  const { unit } = useDistanceUnit();
  const [distanceGroup, setDistanceGroup] = useState<DistanceGroup>("all");
  const [selectedHeartRateBandIds, setSelectedHeartRateBandIds] = useState<string[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const eligibleData = useMemo(
    () => points.filter(hasAerobicDecoupling).map((point) => ({
      ...point,
      activityDateTimestamp: getActivityDateTimestamp(point.activityDate),
    })).sort((left, right) => left.activityDateTimestamp - right.activityDateTimestamp),
    [points],
  );
  const distanceFilteredData = useMemo(
    () => eligibleData.filter((point) => matchesDistanceGroup(point.distanceKm, distanceGroup)),
    [distanceGroup, eligibleData],
  );
  const heartRateBands = useMemo(() => getHeartRateBands(distanceFilteredData), [distanceFilteredData]);
  const selectedHeartRateBandIdSet = useMemo(
    () => new Set(selectedHeartRateBandIds),
    [selectedHeartRateBandIds],
  );
  const hasSelectedHeartRateBands = heartRateBands.some((band) =>
    selectedHeartRateBandIdSet.has(band.id),
  );
  const visibleData = useMemo(
    () => distanceFilteredData.filter((point) =>
      !hasSelectedHeartRateBands || selectedHeartRateBandIdSet.has(getHeartRateBandId(point.avgHeartRate))),
    [distanceFilteredData, hasSelectedHeartRateBands, selectedHeartRateBandIdSet],
  );
  const latestPoint = visibleData.at(-1) ?? null;
  const selectedPoint = selectedActivityId === null
    ? null
    : visibleData.find((point) => point.activityId === selectedActivityId) ?? null;
  const evidencePoint = selectedPoint ?? latestPoint;
  const latestIneligibleReason = [...points]
    .reverse()
    .find((point) => point.aerobicDecouplingStatus === "ineligible")
    ?.aerobicDecouplingUnavailableReason ?? null;
  const priorBaselineValues = latestPoint
    ? visibleData
      .filter((point) =>
        point.activityDateTimestamp < latestPoint.activityDateTimestamp
        && point.activityDateTimestamp >= latestPoint.activityDateTimestamp - 90 * DAY_MS)
      .map((point) => point.aerobicDecouplingPct)
    : [];
  const priorMedian = priorBaselineValues.length >= 4 ? median(priorBaselineValues) : null;
  const priorQ1 = priorBaselineValues.length >= 4 ? quantile(priorBaselineValues, 0.25) : null;
  const priorQ3 = priorBaselineValues.length >= 4 ? quantile(priorBaselineValues, 0.75) : null;
  const dateTicks = useMemo(() => getUniformDateTicks(visibleData), [visibleData]);
  const domain = getAerobicDecouplingDomain(visibleData, priorQ1, priorQ3);
  const activeHeartRateLabels = heartRateBands
    .filter((band) => selectedHeartRateBandIdSet.has(band.id))
    .map((band) => `${band.label} bpm`);
  const comparableRunLabel = [
    comparableDistanceGroupLabel(distanceGroup, unit),
    activeHeartRateLabels.length > 0 ? activeHeartRateLabels.join(", ") : "All avg HR",
  ].join(" / ");
  const toggleHeartRateBand = (bandId: string) => {
    setSelectedActivityId(null);
    setSelectedHeartRateBandIds((currentIds) =>
      nextContiguousHeartRateBandIds(currentIds, bandId, heartRateBands));
  };
  const selectDistanceGroup = (group: DistanceGroup) => {
    setSelectedActivityId(null);
    setDistanceGroup(group);
  };
  const clearHeartRateBands = () => {
    setSelectedActivityId(null);
    setSelectedHeartRateBandIds([]);
  };
  const controls = (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
      <div className="flex flex-wrap items-center justify-start gap-1.5 xl:flex-nowrap" role="group" aria-label="Distance group">
        {(["all", "short", "medium", "long"] as const).map((group) => (
          <button
            key={group}
            type="button"
            aria-pressed={distanceGroup === group}
            className={heartRateBandButtonClass(distanceGroup === group)}
            onClick={() => selectDistanceGroup(group)}
          >
            {distanceGroupLabel(group, unit)}
          </button>
        ))}
      </div>
      {heartRateBands.length > 1 ? (
        <div className="flex flex-wrap items-center justify-start gap-1.5 border-t border-border pt-3 xl:flex-nowrap xl:border-t-0 xl:border-l xl:pt-0 xl:pl-3" role="group" aria-label="Average heart rate range">
          <button
            type="button"
            aria-pressed={!hasSelectedHeartRateBands}
            className={heartRateBandButtonClass(!hasSelectedHeartRateBands)}
            onClick={clearHeartRateBands}
          >
            All
          </button>
          {heartRateBands.map((band) => (
            <button
              key={band.id}
              type="button"
              aria-pressed={selectedHeartRateBandIdSet.has(band.id)}
              className={heartRateBandButtonClass(selectedHeartRateBandIdSet.has(band.id))}
              onClick={() => toggleHeartRateBand(band.id)}
            >
              {band.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <ChartFrame
      title="Aerobic decoupling"
      description="Comparable runs: selected distance and average-heart-rate ranges. Positive values mean lower second-half efficiency."
      info={CHART_INFO.aerobicDecoupling}
      controls={controls}
      contentClassName="min-h-[31rem] xl:h-80 xl:min-h-80"
      descriptionClassName="xl:max-w-none xl:whitespace-nowrap"
    >
      <div className="flex h-full min-h-0 min-w-0 flex-col gap-3 xl:grid xl:grid-cols-[minmax(17rem,1.1fr)_minmax(0,2.9fr)] xl:gap-4">
        <div className="hidden min-h-0 xl:block">
          <AerobicDecouplingComparison
            point={evidencePoint}
            unit={unit}
            unavailableReason={latestIneligibleReason}
            heading={selectedPoint ? "Selected eligible run" : "Latest eligible run"}
          />
        </div>
        <div className="flex min-h-0 min-w-0 flex-col gap-3">
          <div className="xl:hidden">
            {evidencePoint ? (
              <div className="border border-border bg-surface-muted">
                <AerobicDecouplingSummary
                  point={evidencePoint}
                  unit={unit}
                  heading={selectedPoint ? "Selected eligible run" : "Latest eligible run"}
                  showDivider={false}
                />
              </div>
            ) : <AerobicDecouplingUnavailableReason reason={latestIneligibleReason} />}
          </div>
          <div className="flex flex-col items-start gap-0.5 px-1 font-mono text-[10px] leading-4 text-text-soft xl:flex-row xl:items-center xl:justify-between xl:gap-4">
            <span className="xl:whitespace-nowrap">{visibleData.length} eligible comparable {visibleData.length === 1 ? "run" : "runs"}: {comparableRunLabel}</span>
            {priorMedian !== null
              ? <span className="xl:whitespace-nowrap">Prior 90 days: median {formatSignedPercent(priorMedian)} from {priorBaselineValues.length} runs</span>
              : <span className="xl:whitespace-nowrap">Need 4 prior eligible comparable runs for a 90-day baseline.</span>}
          </div>
          <div className="h-72 min-h-72 min-w-0 xl:h-auto xl:min-h-0 xl:flex-1">
            {visibleData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={visibleData} margin={{ top: 8, right: 8, left: 0 }}>
                  <CartesianGrid stroke={CHART_GRID_COLOR} strokeDasharray="2 5" vertical={false} />
                  <XAxis
                    dataKey="activityDateTimestamp"
                    name="Date"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    ticks={dateTicks}
                    tickFormatter={formatTimestampTick}
                    axisLine={false}
                    tickLine={false}
                    tick={axisTick}
                  />
                  <YAxis
                    domain={domain}
                    dataKey="aerobicDecouplingPct"
                    name="Aerobic decoupling"
                    axisLine={false}
                    tickLine={false}
                    tick={axisTick}
                    tickFormatter={formatSignedPercentValue}
                  />
                  <Tooltip content={<AerobicDecouplingTooltip unit={unit} />} cursor={false} />
                  {priorQ1 !== null && priorQ3 !== null ? (
                    <ReferenceArea y1={priorQ1} y2={priorQ3} fill={SECONDARY_SERIES_COLOR} fillOpacity={0.08} />
                  ) : null}
                  <ReferenceLine y={0} stroke={CHART_GRID_COLOR} strokeDasharray="3 4" />
                  {priorMedian !== null ? (
                    <ReferenceLine y={priorMedian} stroke={SECONDARY_SERIES_COLOR} strokeDasharray="3 4" />
                  ) : null}
                  <Scatter data={visibleData} dataKey="aerobicDecouplingPct" name="Eligible runs" fill={PRIMARY_SERIES_COLOR}>
                    {visibleData.map((point) => (
                      <Cell
                        key={`${point.activityDateTimestamp}-${point.activityId}`}
                        fill={aerobicDecouplingClassification(point.aerobicDecouplingPct).color}
                        stroke={point.activityId === evidencePoint?.activityId ? "var(--surface)" : "none"}
                        strokeWidth={point.activityId === evidencePoint?.activityId ? 2 : 0}
                        style={{ cursor: "pointer" }}
                        onClick={() => setSelectedActivityId(point.activityId)}
                      />
                    ))}
                  </Scatter>
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center border border-dashed border-border bg-surface-muted px-4 text-center font-mono text-xs text-text-soft">
                No eligible runs match the selected comparable-run filters.
              </div>
            )}
          </div>
          <AerobicDecouplingMobileEvidence point={evidencePoint} unit={unit} />
        </div>
      </div>
    </ChartFrame>
  );
}

function hasEfficiencyRatioData(point: FitnessPoint): point is EfficiencyRatioSourcePoint {
  return point.avgHeartRate !== null
    && Number.isFinite(point.avgHeartRate)
    && point.distanceKm !== null
    && Number.isFinite(point.distanceKm)
    && point.efficiencyRatio !== null
    && Number.isFinite(point.efficiencyRatio)
    && point.speedKmh !== null
    && Number.isFinite(point.speedKmh);
}

function matchesDistanceGroup(distanceKm: number, group: DistanceGroup): boolean {
  if (group === "all") return true;
  if (group === "short") return distanceKm < 5;
  if (group === "medium") return distanceKm >= 5 && distanceKm < 10;
  return distanceKm >= 10;
}

function distanceGroupLabel(group: DistanceGroup, unit: DistanceUnit): string {
  if (group === "all") return "All";
  if (unit === "mi") {
    if (group === "short") return "Short <3.1 mi";
    if (group === "medium") return "Medium 3.1-6.2 mi";
    return "Long 6.2+ mi";
  }
  if (group === "short") return "Short <5 km";
  if (group === "medium") return "Medium 5-10 km";
  return "Long 10+ km";
}

function comparableDistanceGroupLabel(group: DistanceGroup, unit: DistanceUnit): string {
  if (group === "all") return "All";
  if (unit === "mi") {
    if (group === "short") return "<3.1 mi";
    if (group === "medium") return "3.1-6.2 mi";
    return "6.2+ mi";
  }
  if (group === "short") return "<5 km";
  if (group === "medium") return "5-10 km";
  return "10+ km";
}

function formatEfficiencyRatio(value: number | null | undefined, unit: DistanceUnit): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  return `${value.toFixed(2)} ${unit === "mi" ? "mi/h" : "km/h"} per 10 bpm`;
}

function EfficiencyRatioTooltip({
  active,
  payload,
  unit,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: EfficiencyRatioPoint }>;
  unit: DistanceUnit;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload.map((item) => item.payload).find(Boolean);
  if (!point) return null;

  const speedUnit = unit === "mi" ? "mi/h" : "km/h";

  return (
    <div style={tooltipStyle.contentStyle}>
      <div style={tooltipStyle.labelStyle}>{formatDate(point.activityDate)}</div>
      <div style={tooltipStyle.itemStyle}>
        Distance: {formatDistanceValue(point.distanceKm, unit)}
      </div>
      <div style={tooltipStyle.itemStyle}>
        Speed: {speedFromKmh(point.speedKmh, unit).toFixed(1)} {speedUnit}
      </div>
      <div style={tooltipStyle.itemStyle}>Avg HR: {Math.round(point.avgHeartRate)} bpm</div>
      <div style={tooltipStyle.itemStyle}>
        Session: {formatEfficiencyRatio(point.efficiencyPer10Bpm, unit)}
      </div>
      <div style={tooltipStyle.itemStyle}>
        Rolling 4-run: {formatEfficiencyRatio(point.rollingEfficiencyPer10Bpm, unit)}
      </div>
    </div>
  );
}

export function FitnessEfficiencyChart({ points }: { points: FitnessPoint[] }) {
  const { unit } = useDistanceUnit();
  const [distanceGroup, setDistanceGroup] = useState<DistanceGroup>("all");
  const [selectedHeartRateBandIds, setSelectedHeartRateBandIds] = useState<string[]>([]);
  const sourceData = useMemo(
    () => points.filter(hasEfficiencyRatioData).sort((left, right) =>
      left.activityDate.localeCompare(right.activityDate)),
    [points],
  );
  const distanceFilteredData = useMemo(
    () => sourceData.filter((point) => matchesDistanceGroup(point.distanceKm, distanceGroup)),
    [distanceGroup, sourceData],
  );
  const heartRateBands = useMemo(() => getHeartRateBands(distanceFilteredData), [distanceFilteredData]);
  const selectedHeartRateBandIdSet = useMemo(
    () => new Set(selectedHeartRateBandIds),
    [selectedHeartRateBandIds],
  );
  const hasSelectedHeartRateBands = heartRateBands.some((band) =>
    selectedHeartRateBandIdSet.has(band.id),
  );
  const visibleSourceData = useMemo(
    () => distanceFilteredData.filter((point) =>
      !hasSelectedHeartRateBands
      || selectedHeartRateBandIdSet.has(getHeartRateBandId(point.avgHeartRate))),
    [distanceFilteredData, hasSelectedHeartRateBands, selectedHeartRateBandIdSet],
  );
  const displayPoints = useMemo<EfficiencyRatioPoint[]>(() => {
    const values = visibleSourceData.map((point) => speedFromKmh(point.efficiencyRatio, unit) * 10);

    return visibleSourceData.map((point, index) => {
      const rollingValues = values.slice(Math.max(0, index - 3), index + 1);
      return {
        ...point,
        efficiencyPer10Bpm: values[index],
        rollingEfficiencyPer10Bpm: rollingValues.reduce((sum, value) => sum + value, 0)
          / rollingValues.length,
      };
    });
  }, [unit, visibleSourceData]);
  const latestPoint = displayPoints.at(-1);
  const priorComparableValues = displayPoints
    .slice(-5, -1)
    .map((point) => point.efficiencyPer10Bpm);
  const priorComparableAverage = priorComparableValues.length > 0
    ? priorComparableValues.reduce((sum, value) => sum + value, 0) / priorComparableValues.length
    : null;
  const latestChange = latestPoint && priorComparableAverage
    ? latestPoint.efficiencyPer10Bpm / priorComparableAverage - 1
    : null;
  const efficiencyDomain = getEfficiencyDomain(displayPoints);
  const activeHeartRateLabels = heartRateBands
    .filter((band) => selectedHeartRateBandIdSet.has(band.id))
    .map((band) => `${band.label} bpm`);
  const comparableRunLabel = [
    comparableDistanceGroupLabel(distanceGroup, unit),
    activeHeartRateLabels.length > 0 ? activeHeartRateLabels.join(", ") : "All avg HR",
  ].join(" / ");
  const toggleHeartRateBand = (bandId: string) => {
    setSelectedHeartRateBandIds((currentIds) =>
      nextContiguousHeartRateBandIds(currentIds, bandId, heartRateBands));
  };
  const controls = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-start gap-1.5" role="group" aria-label="Distance group">
        {(["all", "short", "medium", "long"] as const).map((group) => (
          <button
            key={group}
            type="button"
            aria-pressed={distanceGroup === group}
            className={heartRateBandButtonClass(distanceGroup === group)}
            onClick={() => setDistanceGroup(group)}
          >
            {distanceGroupLabel(group, unit)}
          </button>
        ))}
      </div>
      {heartRateBands.length > 1 ? (
        <div className="flex flex-wrap items-center justify-start gap-1.5 border-t border-border pt-3" role="group" aria-label="Average heart rate range">
          <button
            type="button"
            aria-pressed={!hasSelectedHeartRateBands}
          className={heartRateBandButtonClass(!hasSelectedHeartRateBands)}
          onClick={() => setSelectedHeartRateBandIds([])}
        >
            All
          </button>
          {heartRateBands.map((band) => (
            <button
              key={band.id}
              type="button"
              aria-pressed={selectedHeartRateBandIdSet.has(band.id)}
              className={heartRateBandButtonClass(selectedHeartRateBandIdSet.has(band.id))}
              onClick={() => toggleHeartRateBand(band.id)}
            >
              {band.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
  const speedLabel = unit === "mi" ? "miles per hour" : "kilometres per hour";
  const efficiencyInfo = {
    ...CHART_INFO.fitnessEfficiency,
    definition: `The speed-to-HR ratio is session speed in ${speedLabel} divided by average heart rate, displayed as speed per 10 beats per minute. The rolling 4-run line is recalculated from the visible comparable runs.`,
  };

  return (
    <ChartFrame
      title="Speed-to-HR ratio"
      description="Speed per 10 bpm across comparable runs."
      info={efficiencyInfo}
      controls={controls}
    >
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        <div className="flex flex-col items-start gap-0.5 px-1 pb-2 font-mono text-[10px] leading-4 text-text-soft">
          <span>{displayPoints.length} comparable {displayPoints.length === 1 ? "run" : "runs"}: {comparableRunLabel}</span>
          {latestPoint ? (
            <span>
              Latest {formatEfficiencyRatio(latestPoint.efficiencyPer10Bpm, unit)}
              {latestChange !== null ? ` (${formatSignedPercent(latestChange)} vs prior average)` : ""}
            </span>
          ) : null}
        </div>
        <div className="min-h-0 min-w-0 flex-1">
          {displayPoints.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={displayPoints} margin={{ top: 8, right: 8, left: 0 }}>
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
                  tickFormatter={(value) => Number(value).toFixed(2)}
                />
                <Tooltip content={<EfficiencyRatioTooltip unit={unit} />} />
                <Legend
                  content={
                    <FitnessLineLegend
                      sessionLabel="Session ratio (thin)"
                      rollingLabel="Comparable 4-run average (thick)"
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="efficiencyPer10Bpm"
                  name="Session ratio"
                  stroke={PRIMARY_SERIES_COLOR}
                  strokeWidth={1.5}
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="rollingEfficiencyPer10Bpm"
                  name="Comparable 4-run average"
                  stroke={SECONDARY_SERIES_COLOR}
                  strokeWidth={3}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center border border-dashed border-border bg-surface-muted px-4 text-center font-mono text-xs text-text-soft">
              No runs match the selected comparable-run filters.
            </div>
          )}
        </div>
      </div>
    </ChartFrame>
  );
}

const recoveryTooltipLabelFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function RecoveryTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: {
    payload?: RecoveryTrendPoint;
  }[];
}) {
  if (!active || !payload || payload.length === 0) return null;

  const entry = payload.map((item) => item.payload).find(Boolean);
  const date = entry?.activityDate
    ? recoveryTooltipLabelFormat.format(
        new Date(`${entry.activityDate}T00:00:00`),
      )
    : null;
  const recoveryValue = entry?.garminRecoveryHr;
  const baseline = entry?.recoveryPrior90dMedian;
  const windowStart = entry?.activityDate
    ? new Date(`${entry.activityDate}T00:00:00Z`)
    : null;
  if (windowStart) windowStart.setUTCDate(windowStart.getUTCDate() - 90);

  return (
    <div
      style={{
        backgroundColor: "var(--surface)",
        border: "1px solid var(--border)",
        color: "var(--text)",
        boxShadow:
          "0 12px 32px color-mix(in srgb, var(--background) 34%, transparent)",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        lineHeight: 1.35,
        padding: "8px 10px",
      }}
    >
      {date && (
        <div style={{ fontWeight: 700, marginBottom: 2, fontSize: 11 }}>
          {date}
        </div>
      )}
      <div style={{ color: "var(--text-soft)", fontSize: 11, padding: 0 }}>
        Recovery drop:{" "}
        {recoveryValue != null ? `${Math.round(recoveryValue)} bpm` : "\u2014"}
      </div>
      <div style={{ color: "var(--text-soft)", fontSize: 11, padding: 0 }}>
        Baseline before this run:{" "}
        {baseline != null ? `${Math.round(baseline)} bpm` : "\u2014"}
      </div>
      <div style={{ color: "var(--text-soft)", fontSize: 11, padding: 0 }}>
        Difference:{" "}
        {entry?.recoveryDelta != null
          ? `${entry.recoveryDelta > 0 ? "+" : ""}${Math.round(entry.recoveryDelta)} bpm`
          : "\u2014"}
      </div>
      <div style={{ color: "var(--text-soft)", fontSize: 11, padding: 0 }}>
        Baseline observations: {entry?.recoveryPrior90dCount ?? "\u2014"} runs
      </div>
      <div style={{ color: "var(--text-soft)", fontSize: 11, padding: 0 }}>
        Ending HR: {entry?.endingHeartRate != null ? `${Math.round(entry.endingHeartRate)} bpm` : "\u2014"}
      </div>
      {windowStart && date && (
        <div style={{ color: "var(--text-soft)", fontSize: 11, padding: 0 }}>
          Calculation interval: {recoveryTooltipLabelFormat.format(windowStart)} to {date}
        </div>
      )}
      {entry?.recoveryBaselineProvisional && (
        <div style={{ color: "var(--text-soft)", fontSize: 11, padding: 0 }}>
          Baseline is provisional.
        </div>
      )}
      {entry?.recoveryIqr && (
        <div style={{ color: "var(--text-soft)", fontSize: 11, padding: 0 }}>
          Middle 50%: {Math.round(entry.recoveryIqr[0])}-{Math.round(entry.recoveryIqr[1])} bpm
        </div>
      )}
    </div>
  );
}

function recoveryClassificationColor(classification: RecoveryTrendPoint["recoveryClassification"]): string {
  switch (classification) {
    case "better": return SIGNAL_OK_COLOR;
    case "worse": return SIGNAL_ERROR_COLOR;
    case "typical": return MUTED_SERIES_COLOR;
    case "unavailable": return SECONDARY_SERIES_COLOR;
  }
}

function RecoveryBaselineComparison({ point }: { point: RecoveryTrendPoint | undefined }) {
  if (
    !point
    || point.recoveryPrior90dMedian === null
    || point.recoveryIqr === null
    || point.recoveryPrior90dMin === null
    || point.recoveryPrior90dMax === null
  ) {
    const observedCount = point?.recoveryPrior90dCount ?? 0;
    return (
      <div className="min-w-0 border border-border bg-surface-muted px-4 py-3 font-mono text-xs leading-5 text-text-soft">
        <strong className="text-text">Baseline unavailable.</strong>{" "}
        {observedCount} of {RECOVERY_BASELINE_MIN_OBSERVATIONS} comparable recovery readings are
        available in the prior 90 days.
      </div>
    );
  }

  const [q1, q3] = point.recoveryIqr;
  const median = point.recoveryPrior90dMedian;
  const minimum = point.recoveryPrior90dMin;
  const maximum = point.recoveryPrior90dMax;
  const scaleMinimum = Math.min(minimum, point.garminRecoveryHr);
  const scaleMaximum = Math.max(maximum, point.garminRecoveryHr);
  const scaleSpan = scaleMaximum - scaleMinimum;
  const position = (value: number) =>
    scaleSpan === 0 ? "50%" : `${8 + ((value - scaleMinimum) / scaleSpan) * 84}%`;
  const status = point.recoveryClassification === "typical"
    ? "within the typical range"
    : point.recoveryClassification === "better"
      ? "above the prior baseline"
      : "below the prior baseline";

  return (
    <div className="min-w-0 overflow-hidden border border-border bg-surface-muted px-4 py-3">
      <div className="grid min-w-0 grid-cols-1 items-baseline gap-x-3 gap-y-1 font-mono text-xs leading-5 sm:grid-cols-3">
        <span className="text-text-soft">Prior 90-day comparable response</span>
        <span className="text-text-soft sm:text-center">
          Latest: <strong className="text-text">{Math.round(point.garminRecoveryHr)} bpm</strong>{" "}
          ({status})
        </span>
        <span className="text-text-soft sm:text-right">{point.recoveryPrior90dCount} runs</span>
      </div>
      <div
        className="relative mt-5 h-14"
        role="img"
        aria-label={`Latest recovery ${Math.round(point.garminRecoveryHr)} bpm; prior range ${Math.round(minimum)}-${Math.round(maximum)} bpm; first quartile ${Math.round(q1)} bpm; median ${Math.round(median)} bpm; third quartile ${Math.round(q3)} bpm`}
      >
        <div className="absolute top-4 h-px bg-border" style={{ left: "8%", right: "8%" }} />
        <div
          className="absolute top-4 h-px bg-text-faint"
          style={{ left: position(minimum), width: `calc(${position(maximum)} - ${position(minimum)})` }}
        />
        <div
          className="absolute top-4 h-3 -translate-y-1/2 bg-accent-soft"
          style={{ left: position(q1), width: `calc(${position(q3)} - ${position(q1)})` }}
        />
        <div
          className="absolute top-2 h-4 w-px -translate-x-1/2 bg-text-soft"
          style={{ left: position(minimum) }}
        />
        <div
          className="absolute top-1 h-6 w-px -translate-x-1/2 bg-text-soft"
          style={{ left: position(q1) }}
        />
        <div
          className="absolute top-0 h-8 w-px -translate-x-1/2 bg-text"
          style={{ left: position(median) }}
        />
        <div
          className="absolute top-1 h-6 w-px -translate-x-1/2 bg-text-soft"
          style={{ left: position(q3) }}
        />
        <div
          className="absolute top-2 h-4 w-px -translate-x-1/2 bg-text-soft"
          style={{ left: position(maximum) }}
        />
        <div
          className="absolute top-4 size-3 -translate-x-1/2 -translate-y-1/2 border-2 border-surface"
          style={{ left: position(point.garminRecoveryHr), backgroundColor: recoveryClassificationColor(point.recoveryClassification) }}
        />
        <span className="absolute top-8 hidden -translate-x-1/2 whitespace-nowrap font-mono text-[10px] text-text-soft sm:block" style={{ left: position(q1) }}>
          Q1 {Math.round(q1)}
        </span>
        <span className="absolute top-8 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] text-text" style={{ left: position(median) }}>
          Median {Math.round(median)}
        </span>
        <span className="absolute top-8 hidden -translate-x-1/2 whitespace-nowrap font-mono text-[10px] text-text-soft sm:block" style={{ left: position(q3) }}>
          Q3 {Math.round(q3)}
        </span>
        <span className="absolute top-8 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] text-text-soft" style={{ left: position(minimum) }}>
          Min {Math.round(minimum)}
        </span>
        <span className="absolute top-8 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] text-text-soft" style={{ left: position(maximum) }}>
          Max {Math.round(maximum)}
        </span>
      </div>
    </div>
  );
}

export function RecoveryHeartRateChart({ points }: { points: FitnessPoint[] }) {
  const recoveryObservations = useMemo(
    () =>
      points
        .filter(
          (point): point is FitnessPoint & { garminRecoveryHr: number; endingHeartRate: number } =>
            point.garminRecoveryHr !== null && point.endingHeartRate !== null,
        )
        .map((point) => ({ ...point, activityDateTimestamp: recoveryDateTimestamp(point.activityDate) }))
        .sort((left, right) => left.activityDateTimestamp - right.activityDateTimestamp),
    [points],
  );
  const latestObservation = recoveryObservations.at(-1);
  const activeBandId = latestObservation
    ? getHeartRateBandId(latestObservation.endingHeartRate)
    : null;
  const selectedObservations = useMemo(
    () => recoveryObservations.filter(
      (point) => getHeartRateBandId(point.endingHeartRate) === activeBandId,
    ),
    [activeBandId, recoveryObservations],
  );
  const recoveryPoints = useMemo(
    () =>
      buildRecoveryTrendPoints(selectedObservations.map((point) => ({
        activityDate: point.activityDate,
        activityDateTimestamp: point.activityDateTimestamp,
        garminRecoveryHr: point.garminRecoveryHr,
        endingHeartRate: point.endingHeartRate,
        recoveryPrior90dCount: point.recoveryPrior90dCount,
        recoveryPrior90dMedian: point.recoveryPrior90dMedian,
        recoveryPrior90dQ1: point.recoveryPrior90dQ1,
        recoveryPrior90dQ3: point.recoveryPrior90dQ3,
        recoveryPrior90dMin: point.recoveryPrior90dMin,
        recoveryPrior90dMax: point.recoveryPrior90dMax,
      }))),
    [selectedObservations],
  );
  const recoverySummary = useMemo(
    () => getRecoveryTrendSummary(
      recoveryPoints,
      latestObservation?.activityDateTimestamp ?? null,
    ),
    [latestObservation?.activityDateTimestamp, recoveryPoints],
  );
  const recoveryDomain = getRecoveryHeartRateDomain(recoveryPoints);
  const latestRecoveryPoint = recoveryPoints.at(-1);
  const recentRecoveryPoints = useMemo(
    () => getRecoveryPointsWithinDays(recoveryPoints).map((point, index) => ({
      ...point,
      runOrder: index + 1,
      runLabel: shortDate(point.activityDate),
    })),
    [recoveryPoints],
  );
  const latestStripPoint = recentRecoveryPoints.at(-1);
  const activeBandLabel = latestObservation
    ? `${Math.floor(latestObservation.endingHeartRate / HEART_RATE_BAND_SIZE_BPM) * HEART_RATE_BAND_SIZE_BPM}-${Math.floor(latestObservation.endingHeartRate / HEART_RATE_BAND_SIZE_BPM) * HEART_RATE_BAND_SIZE_BPM + HEART_RATE_BAND_SIZE_BPM - 1}`
    : null;

  return (
    <ChartFrame
      title="Post-run recovery response"
      description={activeBandLabel
        ? `Recovery heart-rate drop for runs ending at ${activeBandLabel} bpm, matching the latest recorded run.`
        : "Recovery heart-rate drop after runs with comparable ending heart rate."}
      info={CHART_INFO.recoveryHeartRate}
    >
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        <RecoveryBaselineComparison point={latestRecoveryPoint} />
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1 pt-3 font-mono text-[11px] leading-4 text-text-soft">
          {recoverySummary.daysSinceLastComparableRun !== null
            && recoverySummary.daysSinceLastComparableRun > 0 && (
              <span>Last comparable run: {recoverySummary.daysSinceLastComparableRun} days ago</span>
            )}
        </div>
        <div className="min-h-0 min-w-0 flex-1 pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={recentRecoveryPoints} margin={{ top: 8, right: 8, left: 0 }}>
              <CartesianGrid
                stroke={CHART_GRID_COLOR}
                strokeDasharray="2 5"
                vertical={false}
              />
              <XAxis
                dataKey="runLabel"
                name="Run date"
                type="category"
                interval="preserveStartEnd"
                axisLine={false}
                tickLine={false}
                tick={axisTick}
              />
              <YAxis
                domain={recoveryDomain}
                name="Recovery HR"
                axisLine={false}
                tickLine={false}
                tick={axisTick}
                tickFormatter={(value) => `${Math.round(Number(value))} bpm`}
              />
              <Tooltip content={<RecoveryTooltip />} wrapperStyle={{ zIndex: 10 }} />
              <Legend
                content={<RecoveryLegend latestClassification={latestStripPoint?.recoveryClassification} />}
              />
              {latestRecoveryPoint?.recoveryIqr && (
                <ReferenceArea
                  y1={latestRecoveryPoint.recoveryIqr[0]}
                  y2={latestRecoveryPoint.recoveryIqr[1]}
                  fill={SECONDARY_SERIES_COLOR}
                  fillOpacity={0.08}
                />
              )}
              {latestRecoveryPoint?.recoveryPrior90dMedian != null && (
                <ReferenceLine
                  y={latestRecoveryPoint?.recoveryPrior90dMedian}
                  stroke={SECONDARY_SERIES_COLOR}
                  strokeDasharray="3 4"
                  strokeOpacity={0.7}
                />
              )}
              <Scatter
                data={recentRecoveryPoints}
                dataKey="garminRecoveryHr"
                name="Comparable readings"
                fill={MUTED_SERIES_COLOR}
                stroke="none"
                r={4}
              >
                {recentRecoveryPoints.map((point, index) => {
                  const isLatest = index === recentRecoveryPoints.length - 1;
                  return (
                    <Cell
                      key={`${point.activityDateTimestamp}-${index}`}
                      fill={isLatest
                        ? recoveryClassificationColor(point.recoveryClassification)
                        : MUTED_SERIES_COLOR}
                      stroke={isLatest ? "var(--surface)" : "none"}
                      strokeWidth={isLatest ? 2 : 0}
                    />
                  );
                })}
              </Scatter>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </ChartFrame>
  );
}

function formatPaceDifference(value: number, unit: DistanceUnit): string {
  const seconds = Math.round(Math.abs(paceFromMinPerKm(value, unit) * 60));
  if (seconds === 0) return "same as prior average";
  return `${seconds}s ${value > 0 ? "slower" : "faster"} than prior average`;
}

export function PaceHeartRateTrend({ points }: { points: FitnessPoint[] }) {
  const { unit } = useDistanceUnit();
  const [distanceGroup, setDistanceGroup] = useState<DistanceGroup>("all");
  const [selectedHeartRateBandIds, setSelectedHeartRateBandIds] = useState<string[]>([]);
  const data = useMemo<PaceHeartRateChartPoint[]>(
    () =>
      points
        .filter(hasPaceHeartRate)
        .map((point) => ({
          ...point,
          activityDateTimestamp: getActivityDateTimestamp(point.activityDate),
        }))
        .sort((left, right) => left.activityDateTimestamp - right.activityDateTimestamp),
    [points],
  );
  const distanceFilteredData = useMemo(
    () => data.filter((point) => matchesDistanceGroup(point.distanceKm, distanceGroup)),
    [data, distanceGroup],
  );
  const heartRateBands = useMemo(() => getHeartRateBands(distanceFilteredData), [distanceFilteredData]);
  const selectedHeartRateBandIdSet = useMemo(
    () => new Set(selectedHeartRateBandIds),
    [selectedHeartRateBandIds],
  );
  const hasSelectedHeartRateBands = heartRateBands.some((band) =>
    selectedHeartRateBandIdSet.has(band.id),
  );
  const visibleHeartRateBands = useMemo(
    () => hasSelectedHeartRateBands
      ? heartRateBands.filter((band) => selectedHeartRateBandIdSet.has(band.id))
      : heartRateBands,
    [hasSelectedHeartRateBands, heartRateBands, selectedHeartRateBandIdSet],
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
        data: distanceFilteredData.filter(
          (point) => point.avgHeartRate >= band.min && point.avgHeartRate < band.max,
        ),
      })),
    [bandColorById, distanceFilteredData, visibleHeartRateBands],
  );
  const visibleData = useMemo(
    () => bandSeries.flatMap((series) => series.data).sort(
      (left, right) => left.activityDateTimestamp - right.activityDateTimestamp,
    ),
    [bandSeries],
  );
  const trendData = useMemo(
    () => hasSelectedHeartRateBands ? getLinearPaceTrend(visibleData) : [],
    [hasSelectedHeartRateBands, visibleData],
  );
  const dateTicks = useMemo(() => getUniformDateTicks(visibleData), [visibleData]);
  const paceDomain = useMemo(() => getPaceDomain(visibleData), [visibleData]);
  const latestPoint = visibleData.at(-1);
  const priorComparablePaces = visibleData.slice(-5, -1).map((point) => point.avgPaceMinPerKm);
  const priorComparableAverage = priorComparablePaces.length > 0
    ? priorComparablePaces.reduce((sum, value) => sum + value, 0) / priorComparablePaces.length
    : null;
  const activeHeartRateLabels = heartRateBands
    .filter((band) => selectedHeartRateBandIdSet.has(band.id))
    .map((band) => `${band.label} bpm`);
  const comparableRunLabel = [
    comparableDistanceGroupLabel(distanceGroup, unit),
    activeHeartRateLabels.length > 0 ? activeHeartRateLabels.join(", ") : "All avg HR",
  ].join(" / ");
  const toggleHeartRateBand = (bandId: string) => {
    setSelectedHeartRateBandIds((currentIds) =>
      nextContiguousHeartRateBandIds(currentIds, bandId, heartRateBands));
  };
  const controls = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-start gap-1.5" role="group" aria-label="Distance group">
        {(["all", "short", "medium", "long"] as const).map((group) => (
          <button
            key={group}
            type="button"
            aria-pressed={distanceGroup === group}
            className={heartRateBandButtonClass(distanceGroup === group)}
            onClick={() => setDistanceGroup(group)}
          >
            {distanceGroupLabel(group, unit)}
          </button>
        ))}
      </div>
      {heartRateBands.length > 1 ? (
        <div className="flex flex-wrap items-center justify-start gap-1.5 border-t border-border pt-3" role="group" aria-label="Average heart rate range">
          <button
            type="button"
            aria-pressed={!hasSelectedHeartRateBands}
            className={heartRateBandButtonClass(!hasSelectedHeartRateBands)}
            onClick={() => setSelectedHeartRateBandIds([])}
          >
            All
          </button>
          {heartRateBands.map((band) => (
            <button
              key={band.id}
              type="button"
              aria-pressed={selectedHeartRateBandIdSet.has(band.id)}
              className={heartRateBandButtonClass(selectedHeartRateBandIdSet.has(band.id))}
              onClick={() => toggleHeartRateBand(band.id)}
            >
              <span
                className="size-1.5 shrink-0"
                style={{ backgroundColor: bandColorById.get(band.id) ?? getBandColor(0) }}
                aria-hidden="true"
              />
              {band.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <ChartFrame
      title="Pace at comparable heart rate"
      description="Comparable runs: selected distance and average-heart-rate ranges."
      info={{
        ...CHART_INFO.paceHeartRate,
        definition: `Each coloured dot is a run's average pace, grouped by 10-bpm average-heart-rate band and filtered by distance. Pace is minutes per ${unit === "mi" ? "mile" : "kilometre"}, so lower values are faster.`,
      }}
      controls={controls}
    >
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        <div className="flex flex-col items-start gap-0.5 px-1 pb-2 font-mono text-[10px] leading-4 text-text-soft">
          <span>{visibleData.length} comparable {visibleData.length === 1 ? "run" : "runs"}: {comparableRunLabel}</span>
          {latestPoint ? (
            <span>
              Latest {formatPaceValue(latestPoint.avgPaceMinPerKm, unit)}
              {priorComparableAverage !== null
                ? ` (${formatPaceDifference(latestPoint.avgPaceMinPerKm - priorComparableAverage, unit)})`
                : ""}
            </span>
          ) : null}
        </div>
        <div className="min-h-0 min-w-0 flex-1">
          {visibleData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart data={visibleData} margin={{ top: 8, right: 8, left: 0 }}>
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
                  domain={["dataMin", "dataMax"]}
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
                  tickFormatter={(value) => formatPaceValue(value, unit)}
                />
                <Tooltip
                  content={<PaceHeartRateTooltip unit={unit} />}
                  cursor={false}
                  shared={false}
                />
                {bandSeries.map((series) => (
                  <Scatter
                    key={`${series.band.id}-runs`}
                    data={series.data}
                    name={`${series.band.label} bpm`}
                    fill={series.color}
                    line={false}
                  >
                    {series.data.map((point) => {
                      const isLatest = point.activityDateTimestamp === latestPoint?.activityDateTimestamp;
                      return (
                        <Cell
                          key={`${point.activityDateTimestamp}-${point.activityId}`}
                          fill={series.color}
                          stroke={isLatest ? "var(--surface)" : "none"}
                          strokeWidth={isLatest ? 2 : 0}
                        />
                      );
                    })}
                  </Scatter>
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
                    tooltipType="none"
                  />
                ) : null}
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center border border-dashed border-border bg-surface-muted px-4 text-center font-mono text-xs text-text-soft">
              No runs match the selected comparable-run filters.
            </div>
          )}
        </div>
        {trendData.length > 0 ? (
          <div className="mt-1 flex items-center justify-center gap-1.5 text-[11px] leading-4 text-text-soft">
            <span
              className="h-0.5 w-5 bg-text-soft"
              aria-hidden="true"
            />
            <span>Trend</span>
          </div>
        ) : !hasSelectedHeartRateBands && visibleData.length > 1 ? (
          <p className="mt-1 text-center text-[10px] leading-4 text-text-soft">
            Select an HR bucket or contiguous range to show a pace trend.
          </p>
        ) : null}
      </div>
    </ChartFrame>
  );
}

function formatEconomyValue(value: unknown, decimals: number) {
  const parsed = numberValue(value);
  if (parsed === null) return "n/a";
  return `${parsed.toFixed(decimals)} m/beat`;
}

function computeRolling4Run(
  points: FitnessPoint[],
  key: keyof FitnessPoint,
) {
  return points.map((_point, index) => {
    const window = points
      .slice(Math.max(0, index - 3), index + 1)
      .map((p) => p[key])
      .filter((v): v is number => v !== null && Number.isFinite(v));
    return window.length > 0
      ? window.reduce((sum, v) => sum + v, 0) / window.length
      : null;
  });
}

function getDistanceEconomyDomain(points: FitnessPoint[]): NumericDomain {
  const values = points
    .map((point) => point.distanceEconomyMperBeat)
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (values.length === 0) return [0, 1];

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    const padding = Math.max(Math.abs(min) * 0.08, 0.05);
    return [Math.max(0, min - padding), max + padding];
  }

  const padding = Math.max((max - min) * 0.15, 0.05);
  return [Math.max(0, min - padding), max + padding];
}

function getElevationEconomyDomain(points: FitnessPoint[]): NumericDomain {
  const values = points
    .map((point) => point.elevationEconomyMperBeat)
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (values.length === 0) return [0, 0.01];

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    const padding = Math.max(Math.abs(min) * 0.15, 0.001);
    return [Math.max(0, min - padding), max + padding];
  }

  const padding = Math.max((max - min) * 0.2, 0.001);
  return [Math.max(0, min - padding), max + padding];
}

function DistanceEconomyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{
    payload?: (FitnessPoint & { rollingDistanceEconomy?: number | null });
  }>;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div style={tooltipStyle.contentStyle}>
      <div style={tooltipStyle.labelStyle}>
        {formatDate(point.activityDate)}
      </div>
      <div style={tooltipStyle.itemStyle}>
        Session: {formatEconomyValue(point.distanceEconomyMperBeat, 3)}
      </div>
      <div style={tooltipStyle.itemStyle}>
        Rolling 4-run: {formatEconomyValue(point.rollingDistanceEconomy, 3)}
      </div>
    </div>
  );
}

function ElevationEconomyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{
    payload?: (FitnessPoint & { rollingElevationEconomy?: number | null });
  }>;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div style={tooltipStyle.contentStyle}>
      <div style={tooltipStyle.labelStyle}>
        {formatDate(point.activityDate)}
      </div>
      <div style={tooltipStyle.itemStyle}>
        Session: {formatEconomyValue(point.elevationEconomyMperBeat, 4)}
      </div>
      <div style={tooltipStyle.itemStyle}>
        Rolling 4-run: {formatEconomyValue(point.rollingElevationEconomy, 4)}
      </div>
    </div>
  );
}

function ScoreTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{
    payload?: FitnessPoint;
  }>;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div style={tooltipStyle.contentStyle}>
      <div style={tooltipStyle.labelStyle}>
        {formatDate(point.activityDate)}
      </div>
      <div style={tooltipStyle.itemStyle}>
        Score: {point.personalEfficiencyScore != null ? Math.round(point.personalEfficiencyScore) : "\u2014"}
      </div>
      <div style={tooltipStyle.itemStyle}>
        Distance economy: {point.distanceEconomyMperBeat != null ? `${point.distanceEconomyMperBeat.toFixed(3)} m/beat` : "\u2014"}
      </div>
    </div>
  );
}

export function DistanceEconomyChart({ points }: { points: FitnessPoint[] }) {
  const displayPoints = useMemo(() => {
    const rolling = computeRolling4Run(points, "distanceEconomyMperBeat");
    return points.map((point, index) => ({
      ...point,
      rollingDistanceEconomy: rolling[index],
    }));
  }, [points]);

  return (
    <ChartFrame
      title="Distance economy over time"
      description="Metres travelled per heartbeat."
      info={CHART_INFO.distanceEconomy}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={displayPoints} margin={{ top: 8, right: 8, left: 0 }}>
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
            domain={getDistanceEconomyDomain(points)}
            axisLine={false}
            tickLine={false}
            tick={axisTick}
            tickFormatter={(value) => Number(value).toFixed(2)}
          />
          <Tooltip
            content={<DistanceEconomyTooltip />}
          />
          <Legend
            content={
              <FitnessLineLegend
                sessionLabel="Session economy (thin)"
                rollingLabel="Rolling 4-run economy (thick)"
              />
            }
          />
          <Line
            type="monotone"
            dataKey="distanceEconomyMperBeat"
            name="Distance economy"
            stroke={PRIMARY_SERIES_COLOR}
            strokeWidth={1.5}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="rollingDistanceEconomy"
            name="Rolling 4-run economy"
            stroke={SECONDARY_SERIES_COLOR}
            strokeWidth={3}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function ElevationEconomyChart({ points }: { points: FitnessPoint[] }) {
  const elevationDomain = getElevationEconomyDomain(points);
  const displayPoints = useMemo(() => {
    const rolling = computeRolling4Run(points, "elevationEconomyMperBeat");
    return points.map((point, index) => ({
      ...point,
      rollingElevationEconomy: rolling[index],
    }));
  }, [points]);

  return (
    <ChartFrame
      title="Elevation economy over time"
      description="Vertical metres climbed per heartbeat, with total ascent for context."
      info={CHART_INFO.elevationEconomy}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={displayPoints} margin={{ top: 8, right: 8, left: 0 }}>
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
            yAxisId="economy"
            domain={elevationDomain}
            axisLine={false}
            tickLine={false}
            tick={axisTick}
            tickFormatter={(value) => Number(value).toFixed(3)}
          />
          <YAxis
            yAxisId="ascent"
            orientation="right"
            axisLine={false}
            tickLine={false}
            tick={false}
          />
          <Tooltip
            content={<ElevationEconomyTooltip />}
          />
          <Legend
            content={
              <FitnessLineLegend
                sessionLabel="Elevation economy (thin)"
                rollingLabel="Rolling 4-run economy (thick)"
              />
            }
          />
          <Bar
            yAxisId="ascent"
            dataKey="totalAscent"
            name="Ascent"
            fill={MUTED_SERIES_COLOR}
            opacity={0.3}
          />
          <Line
            yAxisId="economy"
            type="monotone"
            dataKey="elevationEconomyMperBeat"
            name="Elevation economy"
            stroke={PRIMARY_SERIES_COLOR}
            strokeWidth={1.5}
            dot={false}
          />
          <Line
            yAxisId="economy"
            type="monotone"
            dataKey="rollingElevationEconomy"
            name="Rolling 4-run economy"
            stroke={SECONDARY_SERIES_COLOR}
            strokeWidth={3}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

function getEfficiencyScoreDomain(points: FitnessPoint[]): NumericDomain {
  const scores = points
    .map((p) => p.personalEfficiencyScore)
    .filter((v): v is number => v !== null);
  if (scores.length === 0) return [90, 110];
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const domainMin = Math.min(90, min - 5);
  const domainMax = Math.max(110, max + 5);
  return [domainMin, domainMax];
}

export function EfficiencyScoreChart({ points }: { points: FitnessPoint[] }) {
  return (
    <ChartFrame
      title="Personal efficiency score"
      description="Deviation from 100 baseline (dashed). The shaded band is a 5-point typical range."
      info={CHART_INFO.efficiencyScore}
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
            domain={getEfficiencyScoreDomain(points)}
            axisLine={false}
            tickLine={false}
            tick={axisTick}
            tickFormatter={(value) => `${Math.round(Number(value))}`}
          />
          <Tooltip
            content={<ScoreTooltip />}
          />
          <ReferenceArea
            y1={95}
            y2={105}
            fill={MUTED_SERIES_COLOR}
            fillOpacity={0.5}
          />
          <ReferenceLine
            y={100}
            stroke={CHART_GRID_COLOR}
            strokeDasharray="3 4"
          />
          <Line
            type="monotone"
            dataKey="personalEfficiencyScore"
            name="Efficiency score"
            stroke={PRIMARY_SERIES_COLOR}
            strokeWidth={2}
            dot={(dotProps) => {
              const value = dotProps.payload?.personalEfficiencyScore;
              if (value == null) return <></>;
              const color = value > 100
                ? SIGNAL_OK_COLOR
                : value < 100
                  ? SIGNAL_ERROR_COLOR
                  : MUTED_SERIES_COLOR;
              return (
                <circle
                  cx={dotProps.cx}
                  cy={dotProps.cy}
                  r={3}
                  fill={color}
                  stroke="var(--surface)"
                  strokeWidth={1}
                />
              );
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
