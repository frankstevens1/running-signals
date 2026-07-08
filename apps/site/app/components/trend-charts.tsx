"use client";

import { useMemo, useState } from "react";
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
  "var(--accent)",
  "var(--signal)",
  "var(--signal-ok)",
  "#a78bfa",
  "#f43f5e",
  "#38bdf8",
];
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
    backgroundColor: "var(--surface-muted)",
    border: "1px solid var(--border)",
    borderRadius: 4,
    color: "var(--text)",
    boxShadow: "0 10px 24px rgba(0, 0, 0, 0.22)",
    fontSize: 11,
    lineHeight: 1.35,
    padding: "6px 8px",
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
    <span className="text-(--text-soft)">{value}</span>
  ),
  wrapperStyle: {
    color: "var(--text-soft)",
    fontSize: 11,
    lineHeight: "16px",
    paddingTop: 2,
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
    "inline-flex h-8 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-xs font-semibold transition";

  return isSelected
    ? `${base} border-(--accent) bg-(--accent-soft) text-(--text)`
    : `${base} border-(--border) text-(--text-soft) hover:bg-(--surface-muted) hover:text-(--text)`;
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

function ChartFrame({
  title,
  description,
  controls,
  children,
}: {
  title: string;
  description?: string;
  controls?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col rounded-md border border-(--border) bg-(--surface) p-4">
      <h2 className="text-base font-semibold text-(--text)">{title}</h2>
      {description ? <p className="mt-1 text-sm text-(--text-soft)">{description}</p> : null}
      {controls ? <div className="mt-3">{controls}</div> : null}
      <div className="mt-4 h-80 min-h-80 flex-1">{children}</div>
    </div>
  );
}

export function WeeklyVolumeChart({ weeks }: { weeks: WeekRollup[] }) {
  const volumeBreakdown = getWeeklyVolumeBreakdown(weeks);

  return (
    <ChartFrame
      title="Weekly distance and rolling volume"
      description="Weekly distance split by longest run and remaining distance."
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={volumeBreakdown}>
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
          <Legend {...legendProps} />
          <Bar
            dataKey="longestRunDistanceKm"
            name="Longest run"
            stackId="distance"
            fill="var(--accent)"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="otherWeeklyDistanceKm"
            name="Other distance"
            stackId="distance"
            fill="var(--border)"
            radius={[3, 3, 0, 0]}
          />
          <Line
            type="monotone"
            dataKey="rolling4wDistanceKm"
            name="Rolling 4w distance"
            stroke="var(--signal)"
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
          <Legend {...legendProps} />
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
            stroke="var(--signal)"
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
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={completeWeeks}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="weekStartDate"
            tickFormatter={shortDate}
            minTickGap={28}
            tick={{ fill: "var(--text-soft)", fontSize: 12 }}
          />
          <YAxis
            yAxisId="left"
            domain={[0, 7]}
            tick={{ fill: "var(--text-soft)", fontSize: 12 }}
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
            fill="var(--accent)"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            yAxisId="left"
            dataKey="missedDays"
            name="Missed days"
            stackId="days"
            fill="var(--border)"
            radius={[3, 3, 0, 0]}
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
          <Legend {...legendProps} />
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
          <Legend {...legendProps} />
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
    <div
      className="flex flex-wrap items-center justify-center gap-2"
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
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: bandColorById.get(band.id) ?? getBandColor(0) }}
            aria-hidden="true"
          />
          {band.label}
        </button>
      ))}
    </div>
  );

  return (
    <ChartFrame
      title="Pace at comparable heart rate"
      description="Run pace over time within selected average-heart-rate bands."
      controls={controls}
    >
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={visibleData}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="activityDateTimestamp"
                name="Date"
                type="number"
                scale="time"
                domain={visibleData.length > 0 ? ["dataMin", "dataMax"] : [0, 1]}
                ticks={dateTicks}
                tickFormatter={formatTimestampTick}
                minTickGap={28}
                tick={{ fill: "var(--text-soft)", fontSize: 12 }}
              />
              <YAxis
                type="number"
                domain={paceDomain}
                dataKey="avgPaceMinPerKm"
                name="Pace"
                reversed
                tick={{ fill: "var(--text-soft)", fontSize: 12 }}
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
