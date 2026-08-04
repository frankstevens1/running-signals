"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  distanceFromKm,
  paceFromMinPerKm,
  SEGMENT_RESOLUTIONS,
  type DistanceUnit,
  type SegmentResolution,
} from "@/app/lib/distance-unit";
import {
  formatCadence,
  formatDate,
  formatDistance,
  formatDuration,
  formatEconomy,
  formatElevation,
  formatGrade,
  formatHeartRate,
  formatPace,
  formatRouteId,
  formatSpeed,
} from "@/app/lib/format";
import type { MapProfileRecord, RunSegment, RunSession } from "@/app/lib/types";

import { ActivityRouteMap } from "./activity-route-map";
import { useDistanceUnit } from "./distance-unit-provider";
import { useRunRecords } from "../lib/run-records-client";
import { useRunSegments } from "../lib/run-segments-client";

function statItems(run: RunSession, unit: DistanceUnit) {
  return [
    ["Distance", formatDistance(run.distanceKm, unit)],
    ["Duration", formatDuration(run.durationSeconds)],
    ["Pace", formatPace(run.avgPaceMinPerKm, unit)],
    ["Speed", formatSpeed(run.speedKmh, unit)],
    ["Prior 7d", formatDistance(run.prior7dDistanceKm, unit)],
    ["Prior 28d", formatDistance(run.prior28dDistanceKm, unit)],
    ["Avg Cadence", formatCadence(run.avgCadence)],
    ["Max Cadence", formatCadence(run.maxCadence)],
    ["Recovery HR", formatHeartRate(run.garminRecoveryHr)],
    ["Avg HR", formatHeartRate(run.avgHeartRate)],
    ["Max HR", formatHeartRate(run.maxHeartRate)],
    ["Ascent/Descent",
      [formatElevation(run.totalAscent), formatElevation(run.totalDescent)].join(" / "),
    ],
    ["Dist Economy", formatEconomy(run.distanceEconomyMperBeat, 3, "m/beat")],
    ["Elev Economy", formatEconomy(run.elevationEconomyMperBeat, 4, "m/beat")],
    ["Score",
      run.personalEfficiencyScore != null ? `${Math.round(run.personalEfficiencyScore)}` : "\u2014",
    ],
    ["Route",
      run.routeId
        ? (
          <Link
            href={`/routes?routeId=${encodeURIComponent(run.routeId)}`}
            className="font-mono text-(--accent) hover:underline"
          >
            {formatRouteId(run.routeId)}
          </Link>
        )
        : "n/a",
    ],
  ] as const;
}

function SummaryLabel({ label }: { label: string }) {
  const mobileLabel = label === "Ascent/Descent"
    ? "Asc/Desc"
    : label === "Dist Economy"
      ? "Dist Econ."
      : label === "Elev Economy"
        ? "Elev Econ."
        : null;

  if (!mobileLabel) return label;

  return (
    <>
      <span className="sm:hidden">{mobileLabel}</span>
      <span className="hidden sm:inline">{label}</span>
    </>
  );
}

const SUMMARY_UNIT_PATTERN = /(\/km|\/mi|km\/h|mph|m\/beat|bpm|spm|km|mi|m|h)/g;
const SUMMARY_UNIT_PART = /^(\/km|\/mi|km\/h|mph|m\/beat|bpm|spm|km|mi|m|h)$/;

function SummaryValue({ value }: { value: ReactNode }) {
  if (typeof value !== "string") return value;

  const parts = value.split(SUMMARY_UNIT_PATTERN);

  return parts.map((part, index) =>
    SUMMARY_UNIT_PART.test(part) ? (
      <span key={index} className="text-[0.7em] sm:text-[1em]">
        {part}
      </span>
    ) : part.endsWith(" ") && SUMMARY_UNIT_PART.test(parts[index + 1] ?? "") ? (
      <span key={index}>
        {part.trimEnd()}<span className="hidden sm:inline"> </span>
      </span>
    ) : (
      part
    ),
  );
}

type ElevationProfilePoint = {
  distance: number;
  altitudeM: number;
  grade: number | null;
  paceMinPerKm: number | null;
  heartRate: number | null;
};

function profilePoints(records: MapProfileRecord[], unit: DistanceUnit): ElevationProfilePoint[] {
  const points = records.flatMap((record) => {
    if (record.distanceKm === null || record.altitudeM === null) return [];
    return [{
      distanceKm: record.distanceKm,
      altitudeM: record.altitudeM,
      paceMinPerKm: record.paceMinPerKm,
      heartRate: record.heartRate,
    }];
  });

  return points.map((point, index) => {
    const previous = points[Math.max(index - 1, 0)];
    const next = points[Math.min(index + 1, points.length - 1)];
    const distanceDeltaM = (next.distanceKm - previous.distanceKm) * 1000;
    const grade = distanceDeltaM > 0
      ? (next.altitudeM - previous.altitudeM) / distanceDeltaM
      : null;

    return {
      distance: distanceFromKm(point.distanceKm, unit),
      altitudeM: point.altitudeM,
      grade,
      paceMinPerKm: point.paceMinPerKm,
      heartRate: point.heartRate,
    };
  });
}

const ELEVATION_UPPER_MARGIN_PCT = 0.05;
const ELEVATION_Y_AXIS_WIDTH = 48;
const ELEVATION_X_AXIS_HEIGHT = 24;
const ELEVATION_VERTICAL_PADDING = 6;
const ELEVATION_HORIZONTAL_SHIFT = 12;
const decimal2Format = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatSegmentTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "n/a";
  const totalSeconds = Math.round(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function formatSegmentPace(value: number | null, unit: DistanceUnit): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return `${formatSegmentTime(paceFromMinPerKm(value, unit) * 60)} /${unit}`;
}

function formatSegmentValue(value: number | null, unit: string): string {
  return value === null || !Number.isFinite(value)
    ? "n/a"
    : `${Math.round(value)} ${unit}`;
}

function formatSegmentGrade(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  const percentage = value * 100;
  return `${percentage > 0 ? "+" : ""}${decimal2Format.format(percentage)}%`;
}

function splitDistance(segment: RunSegment, unit: DistanceUnit): string {
  const marker = segment.segmentEndDistanceKm === null
    ? segment.segmentIndex * segment.segmentLengthValue
    : distanceFromKm(segment.segmentEndDistanceKm, unit);

  return marker > 0 ? `${decimal2Format.format(marker)} ${unit}` : "n/a";
}

function resolutionLabel(resolution: SegmentResolution, unit: DistanceUnit) {
  if (unit === "mi") return `${resolution} mi`;
  if (resolution === 0.25) return "250 m";
  if (resolution === 0.5) return "500 m";
  return "1 km";
}

function ElevationTooltip({
  active,
  payload,
  unit,
}: {
  active?: boolean;
  payload?: { payload?: ElevationProfilePoint }[];
  unit: DistanceUnit;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload.map((item) => item.payload).find(Boolean);
  if (!point) return null;

  return (
    <div className="pointer-events-none w-52 border border-(--border-strong) bg-(--surface) text-(--text) shadow-[var(--shadow-header)]">
      <p className="px-3 pt-2 font-mono text-[9px] uppercase tracking-[0.12em] text-(--accent)">
        Altitude - grade
      </p>
      <div className="grid grid-cols-2 gap-3 px-3 pb-2 pt-1 font-mono text-sm">
        <span>{formatElevation(point.altitudeM)}</span>
        <span className="text-right">{formatGrade(point.grade)}</span>
      </div>
      <div className="grid grid-cols-2 divide-x divide-(--border) border-y border-(--border)">
        <div className="px-3 py-2">
          <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-(--text-faint)">
            Pace
          </p>
          <p className="mt-0.5 whitespace-nowrap font-mono text-[11px] text-(--text)">
            {formatPace(point.paceMinPerKm, unit)}
          </p>
        </div>
        <div className="px-3 py-2">
          <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-(--text-faint)">
            Heart rate
          </p>
          <p className="mt-0.5 whitespace-nowrap font-mono text-[11px] text-(--text)">
            {formatHeartRate(point.heartRate)}
          </p>
        </div>
      </div>
      <p className="px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-(--text-faint)">
        Distance {point.distance.toFixed(2)} {unit}
      </p>
    </div>
  );
}

export function RunDetailDialog({
  run,
  open,
  onClose,
}: {
  run: RunSession | null;
  open: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const splitSelectorRef = useRef<HTMLDivElement | null>(null);
  const { unit } = useDistanceUnit();
  const [resolution, setResolution] = useState<SegmentResolution>(1);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [isSplitSelectorStuck, setIsSplitSelectorStuck] = useState(false);
  const recordState = useRunRecords(run?.runId ?? "", open && run !== null);
  const segmentState = useRunSegments(
    run?.runId ?? "",
    unit,
    resolution,
    open && run !== null,
  );
  const hideSegmentDuration = resolution === 1;
  const elevationPoints = recordState.records ? profilePoints(recordState.records, unit) : [];
  const elevationAltitudes = elevationPoints.map((p) => p.altitudeM);
  const elevationMin = elevationAltitudes.length > 0 ? Math.min(...elevationAltitudes) : 0;
  const elevationMax = elevationAltitudes.length > 0 ? Math.max(...elevationAltitudes) : 100;
  const elevationDomainMax =
    elevationMax + (elevationMax - elevationMin) * ELEVATION_UPPER_MARGIN_PCT;

  useEffect(() => {
    if (!open) return;

    const header = headerRef.current;
    if (!header) return;

    const headerElement = header;

    function updateHeaderHeight() {
      setHeaderHeight(headerElement.getBoundingClientRect().height);
    }

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateHeaderHeight);
    resizeObserver?.observe(headerElement);
    window.addEventListener("resize", updateHeaderHeight);
    updateHeaderHeight();

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateHeaderHeight);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const dialog = dialogRef.current;
    const header = headerRef.current;
    const selector = splitSelectorRef.current;
    if (!dialog || !header || !selector) return;

    const dialogElement = dialog;
    const headerElement = header;
    const selectorElement = selector;
    let animationFrame: number | null = null;

    function updateStickyState() {
      animationFrame = null;
      const distanceFromHeader =
        selectorElement.getBoundingClientRect().top - headerElement.getBoundingClientRect().bottom;
      const isStuck = Math.abs(distanceFromHeader) <= 1.5;
      setIsSplitSelectorStuck((current) => (current === isStuck ? current : isStuck));
    }

    function scheduleUpdate() {
      if (animationFrame === null) {
        animationFrame = window.requestAnimationFrame(updateStickyState);
      }
    }

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleUpdate);
    resizeObserver?.observe(headerElement);
    resizeObserver?.observe(selectorElement);
    dialogElement.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    scheduleUpdate();

    return () => {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      dialogElement.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [headerHeight, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousActiveElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const dialog = dialogRef.current;
    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    dialog?.querySelector<HTMLElement>(focusableSelector)?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialog) {
        return;
      }

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
      const first = focusable[0];
      const last = focusable.at(-1);

      if (!first || !last) {
        event.preventDefault();
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousActiveElement?.focus();
    };
  }, [onClose, open]);

  if (!open || !run) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-3 py-4 backdrop-blur-sm sm:px-4 sm:py-6"
      onMouseDown={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="max-h-[calc(100vh-2rem)] w-full max-w-6xl overflow-y-auto border border-(--border) bg-(--surface) shadow-2xl sm:max-h-[calc(100vh-3rem)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div
          ref={headerRef}
          className="sticky top-0 z-20 flex items-start justify-between gap-4 border-b border-(--border) bg-(--surface) px-5 py-4"
        >
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-(--accent)">
              inspect::run_session
            </p>
            <h2 id={titleId} className="mt-1 font-mono text-xl text-(--text)">
              {formatDate(run.activityDate)}
            </h2>
            <p id={descriptionId} className="mt-1 text-sm text-(--text-soft)">
              {formatDistance(run.distanceKm, unit)} in {formatDuration(run.durationSeconds)} at{" "}
              {formatPace(run.avgPaceMinPerKm, unit)}.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close run detail"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center border border-(--border) text-(--text-soft) transition hover:border-(--text-soft) hover:bg-(--surface-muted) hover:text-(--text)"
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-6 px-5 py-5">
          <section className="space-y-4">
            <div>
              {recordState.isLoading ? (
                <div className="h-80 animate-pulse border border-(--border) bg-(--surface-muted)" />
              ) : recordState.error ? (
                <div className="flex h-80 items-center justify-center border border-dashed border-(--border) bg-(--surface-muted) px-4 font-mono text-xs text-(--text-soft)">
                  {recordState.error}
                </div>
              ) : (
                <ActivityRouteMap
                  records={recordState.records ?? []}
                  className="h-80 border border-(--border) bg-(--surface-muted)"
                />
              )}
            </div>

            <div className="space-y-3">
              <h3 className="font-mono text-xs uppercase tracking-[0.12em] text-(--text)">
                session_summary
              </h3>
              <dl className="grid border-l border-t border-(--border) grid-cols-3 lg:grid-cols-4">
                {statItems(run, unit).map(([label, value]) => (
                  <div
                    key={label}
                    className={`${label === "Route" ? "hidden lg:block " : ""}border-r border-b border-(--border) bg-(--surface-muted)/60 px-3 py-3`}
                  >
                    <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-(--text-soft)">
                      <SummaryLabel label={label} />
                    </dt>
                    <dd className="mt-1 font-mono text-sm text-(--text)">
                      <SummaryValue value={value} />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="font-mono text-xs uppercase tracking-[0.12em] text-(--text)">
                elevation_profile
              </h3>
              <p className="mt-1 text-xs text-(--text-soft)">
                Built from ordered activity-record distance and altitude fields.
              </p>
            </div>
            {elevationPoints.length === 0 ? (
              <div className="border border-dashed border-(--border) bg-(--surface-muted) p-6 font-mono text-xs text-(--text-soft)">
                No elevation profile is available for this run.
              </div>
            ) : (
              <div className="h-64 border border-(--border) bg-(--surface-muted)">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={elevationPoints}
                    margin={{
                      top: ELEVATION_X_AXIS_HEIGHT,
                      right: ELEVATION_Y_AXIS_WIDTH - ELEVATION_HORIZONTAL_SHIFT,
                      bottom: ELEVATION_VERTICAL_PADDING,
                      left: ELEVATION_HORIZONTAL_SHIFT,
                    }}
                  >
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="distance"
                      height={ELEVATION_X_AXIS_HEIGHT}
                      tick={{ fill: "var(--text-soft)", fontSize: 11 }}
                      tickMargin={4}
                      stroke="var(--border)"
                      tickFormatter={(value: number) => `${value.toFixed(1)} ${unit}`}
                    />
                    <YAxis
                      domain={[elevationMin, elevationDomainMax]}
                      tick={{ fill: "var(--text-soft)", fontSize: 11 }}
                      tickMargin={4}
                      stroke="var(--border)"
                      tickFormatter={(value: number) => `${Math.round(value)} m`}
                      width={ELEVATION_Y_AXIS_WIDTH}
                    />
                    <Tooltip
                      content={<ElevationTooltip unit={unit} />}
                      cursor={{
                        stroke: "var(--accent)",
                        strokeDasharray: "3 3",
                        strokeWidth: 1,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="altitudeM"
                      stroke="var(--accent)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="font-mono text-xs uppercase tracking-[0.12em] text-(--text)">
                segment_splits::{resolutionLabel(resolution, unit).toLowerCase().replace(" ", "_")}
              </h3>
              <p className="text-xs text-(--text-soft)">
                Ordered analytical rows from <code className="font-mono text-(--text)">mart_run_segments</code>.
              </p>
            </div>
            <div
              ref={splitSelectorRef}
              className={`sticky z-10 -mx-5 flex justify-center border-b bg-(--surface) px-4 py-2 transition-colors duration-150 ${
                isSplitSelectorStuck ? "border-(--border)" : "border-transparent"
              }`}
              style={{ top: headerHeight }}
            >
              <div className="flex items-center justify-center gap-1.5" role="group" aria-label="Split resolution">
                {SEGMENT_RESOLUTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={resolution === option}
                    onClick={() => setResolution(option)}
                    className={`h-7 border px-2.5 font-mono text-[9px] uppercase tracking-[0.06em] transition-colors ${
                      resolution === option
                        ? "border-(--accent) bg-(--accent-soft) text-(--accent)"
                        : "border-(--border) text-(--text-soft) hover:border-(--text-soft) hover:text-(--text)"
                    }`}
                  >
                    {resolutionLabel(option, unit)}
                  </button>
                ))}
              </div>
            </div>
            {segmentState.isLoading ? (
              <div className="border border-(--border) bg-(--surface-muted) p-6 font-mono text-xs text-(--text-soft)">
                Loading segment splits...
              </div>
            ) : segmentState.error ? (
              <div className="border border-dashed border-(--border) bg-(--surface-muted) p-6 font-mono text-xs text-(--text-soft)">
                {segmentState.error}
              </div>
            ) : !segmentState.segments || segmentState.segments.length === 0 ? (
              <div className="border border-dashed border-(--border) bg-(--surface-muted) p-6 font-mono text-xs text-(--text-soft)">
                No segment details are available for this run.
              </div>
            ) : (
              <div className="overflow-hidden border border-(--border)">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-(--border) font-mono text-xs">
                    <thead className="bg-(--surface-muted) text-left text-(--text-soft)">
                      <tr>
                        <th className="px-3 py-3 font-medium">Split</th>
                        {!hideSegmentDuration ? (
                          <th className="px-3 py-3 font-medium">Duration</th>
                        ) : null}
                        <th className="px-3 py-3 font-medium">Pace</th>
                        <th className="px-3 py-3 font-medium">Avg HR</th>
                        <th className="px-3 py-3 font-medium">Max HR</th>
                        <th className="px-3 py-3 font-medium">Elev</th>
                        <th className="px-3 py-3 font-medium">Grade</th>
                        <th className="px-3 py-3 font-medium">Cadence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-(--border) bg-(--surface)">
                      {segmentState.segments.map((segment) => (
                        <tr
                          key={`${segment.runId}-${segment.unitSystem}-${segment.segmentLengthValue}-${segment.segmentIndex}`}
                          className="transition-colors hover:bg-(--accent-soft)"
                        >
                          <td className="whitespace-nowrap px-4 py-3 font-medium text-(--text)">
                            {splitDistance(segment, unit)}
                          </td>
                          {!hideSegmentDuration ? (
                            <td className="whitespace-nowrap px-4 py-3">
                              {formatSegmentTime(segment.segmentDurationSeconds)}
                            </td>
                          ) : null}
                          <td className="whitespace-nowrap px-4 py-3">
                            {formatSegmentPace(segment.segmentPaceMinPerKm, unit)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {formatSegmentValue(segment.avgHeartRate, "bpm")}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {formatSegmentValue(segment.maxHeartRate, "bpm")}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {formatSegmentValue(segment.elevationChangeM, "m")}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {formatSegmentGrade(segment.segmentGrade)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {formatSegmentValue(segment.avgRunningCadence, "spm")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
