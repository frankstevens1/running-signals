"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Info } from "lucide-react";
import type { LiveDriftTracePoint } from "@/app/lib/types";

const CONFIDENCE_BAND_COLORS = {
  stable: "var(--signal-ok)",
  moderate: "var(--signal-warn)",
  high: "var(--signal-error)",
};

const MOBILE_POINT_COUNT = 60;

type ChartPoint = {
  distanceKm: number;
  efficiency: number | null;
  stableEfficiency: number | null;
  moderateEfficiency: number | null;
  highEfficiency: number | null;
  confidence: number;
  heartRate: number | null;
  paceMinPerKm: number | null;
};

function chartPoints(
  trace: LiveDriftTracePoint[],
  compact: boolean,
  hrPoints?: { distanceKm: number; heartRate: number }[],
  pacePoints?: { distanceKm: number; paceMinPerKm: number }[],
): ChartPoint[] {
  const hrByDistance = new Map<number, number>();
  if (hrPoints) {
    for (const p of hrPoints) {
      hrByDistance.set(Math.round(p.distanceKm * 1000) / 1000, p.heartRate);
    }
  }
  const paceByDistance = new Map<number, number>();
  if (pacePoints) {
    for (const p of pacePoints) {
      paceByDistance.set(Math.round(p.distanceKm * 1000) / 1000, p.paceMinPerKm);
    }
  }

  function nearest(distanceKm: number, map: Map<number, number>): number | null {
    if (map.size === 0) return null;
    const key = Math.round(distanceKm * 1000) / 1000;
    if (map.has(key)) return map.get(key)!;
    let closest: number | null = null;
    let minDiff = Infinity;
    for (const [k, v] of map) {
      const diff = Math.abs(k - distanceKm);
      if (diff < minDiff) {
        minDiff = diff;
        closest = v;
      }
    }
    return minDiff < 0.05 ? closest : null;
  }
  const points = trace.map((p) => ({
    distanceKm: p.cumulativeDistanceKm,
    efficiency: p.normalizedEfficiency,
    stableEfficiency:
      p.normalizedEfficiency !== null && p.normalizedEfficiency >= 97.5
        ? p.normalizedEfficiency
        : null,
    moderateEfficiency:
      p.normalizedEfficiency !== null
        && p.normalizedEfficiency >= 95
        && p.normalizedEfficiency < 97.5
        ? p.normalizedEfficiency
        : null,
    highEfficiency:
      p.normalizedEfficiency !== null && p.normalizedEfficiency < 95
        ? p.normalizedEfficiency
        : null,
    confidence: p.confidence,
    heartRate: nearest(p.cumulativeDistanceKm, hrByDistance),
    paceMinPerKm: nearest(p.cumulativeDistanceKm, paceByDistance),
  }));

  // Forward-fill isolated nulls where the point is not excluded
  let lastEff: number | null = null;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.efficiency !== null) {
      lastEff = p.efficiency;
    } else if (p.confidence > 0 && lastEff !== null) {
      p.efficiency = lastEff;
      if (lastEff >= 97.5) p.stableEfficiency = lastEff;
      else if (lastEff >= 95) p.moderateEfficiency = lastEff;
      else p.highEfficiency = lastEff;
    }
  }

  if (!compact || points.length <= MOBILE_POINT_COUNT) return points;

  const step = Math.ceil(points.length / MOBILE_POINT_COUNT);
  return points.filter((_, index) => index % step === 0);
}

function domain(values: (number | null)[]): [number, number] {
  const numValues = values.filter((v) => v !== null) as number[];
  if (numValues.length === 0) return [96, 104];
  const min = Math.min(...numValues);
  const max = Math.max(...numValues);
  const padding = Math.max((max - min) * 0.15, 2);
  const rawMin = min - padding;
  const rawMax = max + padding;
  const halfRange = Math.max(Math.ceil(Math.max(100 - rawMin, rawMax - 100)), 4);
  return [100 - halfRange, 100 + halfRange];
}

function currentDrift(trace: LiveDriftTracePoint[]): {
  value: number | null;
  confidence: number;
} {
  const validPoints = trace.filter((p) => !p.excluded && p.normalizedEfficiency !== null);
  if (validPoints.length < 2) {
    return { value: null, confidence: 0 };
  }

  const latest = validPoints[validPoints.length - 1];
  const drift =
    latest.normalizedEfficiency !== null
      ? Math.round((latest.normalizedEfficiency - 100) * 10) / 10
      : null;

  return { value: drift, confidence: latest.confidence };
}

function interpretation(
  driftValue: number | null,
  decouplingPct: number | null,
  decouplingEligible: boolean,
): string {
  if (driftValue === null) {
    return "No live drift data is available for this run.";
  }

  const driftStr = `${driftValue > 0 ? "+" : ""}${driftValue}%`;
  const direction = driftValue >= 0 ? "above" : "below";
  const driftLabel = `${driftStr} ${direction} baseline`;

  if (!decouplingEligible || decouplingPct === null) {
    return `Aerobic decoupling is unavailable. Ending efficiency ${driftLabel}.`;
  }

  const decValue = Math.round(decouplingPct * 100 * 10) / 10;
  const decStr = `${decValue > 0 ? "+" : ""}${decValue}%`;
  const absDrift = Math.abs(driftValue);
  const absDec = Math.abs(decValue);
  const decGood = decValue < 0;
  const driftGood = driftValue >= 0;
  const close = Math.abs(absDec - absDrift) <= 1.0;
  const decEven = absDec <= 0.5;

  // Q1: both good
  if (decGood && driftGood) {
    if (close) {
      return `Ending efficiency ${driftLabel} reflects negative decoupling (aerobic decoupling ${decStr}).`;
    }
    if (absDrift > absDec) {
      return `Ending efficiency ${driftLabel} surpasses the aerobic decoupling reading (${decStr}).`;
    }
    return `Ending efficiency ${driftLabel} falls short of the aerobic decoupling reading (${decStr}).`;
  }

  // Q2: dec good, drift bad
  if (decGood && !driftGood) {
    if (absDrift < absDec) {
      return `Ending efficiency ${driftLabel} despite negative decoupling (aerobic decoupling ${decStr}). Late fade.`;
    }
    return `Ending efficiency ${driftLabel} reversing negative decoupling (aerobic decoupling ${decStr}). Significant late decline.`;
  }

  // Q3: dec bad, drift good
  if (!decGood && driftGood) {
    if (decEven) {
      return `Ending efficiency ${driftLabel} with low decoupling (aerobic decoupling ${decStr}).`;
    }
    if (absDrift >= absDec) {
      return `Ending efficiency ${driftLabel} despite high decoupling (aerobic decoupling ${decStr}). Recovery toward the finish.`;
    }
    return `Ending efficiency ${driftLabel}, partially recovering from high decoupling (aerobic decoupling ${decStr}).`;
  }

  // Q4: both bad
  if (decEven) {
    return `Ending efficiency ${driftLabel} with low decoupling (aerobic decoupling ${decStr}).`;
  }
  if (close) {
    return `Ending efficiency ${driftLabel} reflects the aerobic decoupling reading (${decStr}).`;
  }
  if (absDrift > absDec) {
    return `Ending efficiency ${driftLabel}, worse than the aerobic decoupling reading (${decStr}).`;
  }
  return `Ending efficiency ${driftLabel}, an improvement over the aerobic decoupling reading (${decStr}). Partial recovery.`;
}

function DriftTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: ChartPoint }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  const drift =
    point.efficiency !== null
      ? `${point.efficiency > 100 ? "+" : ""}${(point.efficiency - 100).toFixed(1)}%`
      : "Excluded";

  return (
    <div className="pointer-events-none w-52 border border-border-strong bg-surface text-text shadow-(--shadow-header)">
      <p className="px-3 pt-2 font-mono text-[9px] uppercase tracking-[0.12em] text-accent">
        Efficiency - drift
      </p>
      <div className="grid grid-cols-2 gap-3 px-3 pb-2 pt-1 font-mono text-sm">
        <span>{(point.efficiency ?? 100).toFixed(1)}</span>
        <span className="text-right">{drift}</span>
      </div>
      <div className="grid grid-cols-2 divide-x divide-border border-y border-border">
        <div className="px-3 py-2">
          <p className="font-mono text-[8px] uppercase tracking-widest text-text-faint">
            Pace
          </p>
          <p className="mt-0.5 whitespace-nowrap font-mono text-[11px] text-text">
            {point.paceMinPerKm !== null
              ? (() => { const s = Math.round(point.paceMinPerKm! * 60); return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`; })() + " /km"
              : "n/a"}
          </p>
        </div>
        <div className="px-3 py-2">
          <p className="font-mono text-[8px] uppercase tracking-widest text-text-faint">
            Heart rate
          </p>
          <p className="mt-0.5 whitespace-nowrap font-mono text-[11px] text-text">
            {point.heartRate !== null ? `${Math.round(point.heartRate)} bpm` : "n/a"}
          </p>
        </div>
      </div>
      <p className="px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-text-faint">
        Distance {point.distanceKm.toFixed(2)} km
      </p>
    </div>
  );
}

export function LiveDriftChart({
  trace,
  decouplingPct,
  decouplingStatus,
  hrPoints,
  pacePoints,
  compact = false,
  className,
}: {
  trace: LiveDriftTracePoint[];
  decouplingPct?: number | null;
  decouplingStatus?: "eligible" | "ineligible" | null;
  hrPoints?: { distanceKm: number; heartRate: number }[];
  pacePoints?: { distanceKm: number; paceMinPerKm: number }[];
  compact?: boolean;
  className?: string;
}) {
  const points = useMemo(() => chartPoints(trace, compact, hrPoints, pacePoints), [trace, compact, hrPoints, pacePoints]);
  const drift = useMemo(() => currentDrift(trace), [trace]);
  const decouplingEligible = decouplingStatus === "eligible" && decouplingPct !== null;
  const interpretText = useMemo(
    () => interpretation(drift.value, decouplingPct ?? null, decouplingEligible),
    [drift.value, decouplingPct, decouplingEligible],
  );

  const efficiencyValues = points.map((p) => p.efficiency);
  const yDomain = domain(efficiencyValues);

  const hrDomain = useMemo(() => {
    const values = (hrPoints ?? []).map((p) => p.heartRate);
    if (values.length === 0) return [80, 200] as [number, number];
    const min = Math.min(...values);
    const max = Math.max(...values);
    return [Math.max(60, min - 10), Math.min(220, max + 10)] as [number, number];
  }, [hrPoints]);

  const warmupEndDistance = useMemo(() => {
    const firstValid = trace.find((p) => !p.excluded);
    return firstValid?.cumulativeDistanceKm ?? 0;
  }, [trace]);

  if (points.length < 2) {
    return (
      <div className={`flex items-center justify-center border border-dashed border-border bg-surface-muted p-6 font-mono text-xs text-text-soft ${className ?? ""}`}>
        Trace data is unavailable for this run.
      </div>
    );
  }

  if (compact) {
    return (
      <div className={className}>
        <div className="flex items-baseline gap-2">
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-soft">
            Live drift
          </p>
          {drift.value !== null ? (
            <span className="font-mono text-sm text-text">
              {drift.value > 0 ? "+" : ""}
              {drift.value}%
            </span>
          ) : (
            <span className="font-mono text-sm text-text-soft">n/a</span>
          )}
        </div>
        <div className="mt-2 h-32 border border-border bg-surface-muted">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={points}
              margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
            >
              <Line
                type="monotone"
                dataKey="efficiency"
                stroke="var(--accent)"
                strokeWidth={1.5}
                dot={false}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1.5 text-[11px] leading-4 text-text-soft">
          {interpretText}
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      <div className="overflow-hidden border border-border bg-surface-muted">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={points}
            margin={{ top: 24, right: 16, bottom: 6, left: 0 }}
          >
            <CartesianGrid
              stroke="var(--border)"
              strokeDasharray="3 3"
            />

            {warmupEndDistance > 0 ? (
              <ReferenceArea
                x1={0}
                x2={warmupEndDistance}
                fill="var(--surface)"
                fillOpacity={0.35}
              />
            ) : null}

            <ReferenceArea
              yAxisId="efficiency"
              y1={97.5}
              y2={yDomain[1]}
              fill={CONFIDENCE_BAND_COLORS.stable}
              fillOpacity={0.12}
            />
            <ReferenceArea
              yAxisId="efficiency"
              y1={95}
              y2={97.5}
              fill={CONFIDENCE_BAND_COLORS.moderate}
              fillOpacity={0.12}
            />
            <ReferenceArea
              yAxisId="efficiency"
              y1={yDomain[0]}
              y2={95}
              fill={CONFIDENCE_BAND_COLORS.high}
              fillOpacity={0.12}
            />

            <ReferenceLine
              yAxisId="efficiency"
              y={100}
              stroke="var(--text-soft)"
              strokeDasharray="4 3"
              strokeWidth={1}
            />

            <XAxis
              dataKey="distanceKm"
              tick={{ fill: "var(--text-soft)", fontSize: 11 }}
              tickMargin={4}
              stroke="var(--border)"
              tickFormatter={(value: number) => `${value.toFixed(1)} km`}
            />

            <YAxis
              yAxisId="efficiency"
              domain={yDomain}
              tick={{ fill: "var(--text-soft)", fontSize: 11 }}
              tickMargin={4}
              stroke="var(--border)"
              tickFormatter={(value: number) => `${value.toFixed(1)}`}
              width={48}
            />
            {hrPoints && hrPoints.length > 0 ? (
              <YAxis
                yAxisId="hr"
                orientation="right"
                domain={hrDomain}
                tick={{ fill: "var(--text-faint)", fontSize: 10 }}
                tickMargin={4}
                stroke="var(--border)"
                tickFormatter={(value: number) => `${value}`}
                width={32}
              />
            ) : null}

            <Tooltip content={<DriftTooltip />} />

            <Line
              yAxisId="efficiency"
              type="monotone"
              dataKey="stableEfficiency"
              stroke={CONFIDENCE_BAND_COLORS.stable}
              strokeWidth={2}
              strokeOpacity={0.85}
              dot={false}
              connectNulls={false}
            />
            <Line
              yAxisId="efficiency"
              type="monotone"
              dataKey="moderateEfficiency"
              stroke={CONFIDENCE_BAND_COLORS.moderate}
              strokeWidth={2}
              strokeOpacity={0.85}
              dot={false}
              connectNulls={false}
            />
            <Line
              yAxisId="efficiency"
              type="monotone"
              dataKey="highEfficiency"
              stroke={CONFIDENCE_BAND_COLORS.high}
              strokeWidth={2}
              strokeOpacity={0.85}
              dot={false}
              connectNulls={false}
            />
            {hrPoints && hrPoints.length > 0 ? (
              <Line
                yAxisId="hr"
                type="monotone"
                dataKey="heartRate"
                stroke="var(--signal-error)"
                strokeWidth={1.5}
                strokeOpacity={0.35}
                dot={false}
                connectNulls={false}
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-2 px-6 py-1.5 text-center">
        <p className="text-xs text-text-soft">
          <Info className="mr-1.5 inline h-3.5 w-3.5 -translate-y-px text-text-faint" aria-hidden="true" />
          {interpretText}
        </p>
      </div>
    </div>
  );
}
