"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
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
  SEGMENT_RESOLUTIONS,
  type DistanceUnit,
  type SegmentResolution,
} from "@/app/lib/distance-unit";
import {
  formatCadence,
  formatDate,
  formatDistance,
  formatDuration,
  formatElevation,
  formatGrade,
  formatHeartRate,
  formatPace,
  formatRouteId,
  formatSpeed,
} from "@/app/lib/format";
import type { ActivityRecord, RunSegment, RunSession } from "@/app/lib/types";

import { ActivityRouteMap } from "./activity-route-map";
import { useDistanceUnit } from "./distance-unit-provider";
import { useRunRecords } from "./run-records-client";
import { useRunSegments } from "./run-segments-client";

function statItems(run: RunSession, unit: DistanceUnit) {
  return [
    ["Distance", formatDistance(run.distanceKm, unit)],
    ["Duration", formatDuration(run.durationSeconds)],
    ["Pace", formatPace(run.avgPaceMinPerKm, unit)],
    ["Speed", formatSpeed(run.speedKmh, unit)],
    ["Avg HR", formatHeartRate(run.avgHeartRate)],
    ["Max HR", formatHeartRate(run.maxHeartRate)],
    ["Ascent", formatElevation(run.totalAscent)],
    ["Descent", formatElevation(run.totalDescent)],
    ["Recovery HR", formatHeartRate(run.garminRecoveryHr)],
    ["Resting HR", formatHeartRate(run.restingHeartRate)],
    ["HRV", run.hrvValue === null ? "n/a" : String(Math.round(run.hrvValue))],
    ["HRV status", run.hrvStatus ?? "n/a"],
    ["Sleep score", run.sleepScore === null ? "n/a" : String(Math.round(run.sleepScore))],
    ["Sleep duration", formatDuration(run.sleepDurationSeconds)],
    ["Route", formatRouteId(run.routeId)],
    ["GPS coverage", run.recordDistanceCoverageRatio === null ? "n/a" : `${Math.round(run.recordDistanceCoverageRatio * 100)}%`],
    ["Prior 7d", formatDistance(run.prior7dDistanceKm, unit)],
    ["Prior 28d", formatDistance(run.prior28dDistanceKm, unit)],
  ] as const;
}

function profilePoints(records: ActivityRecord[], unit: DistanceUnit) {
  return records.flatMap((record) => {
    if (record.distanceKm === null || record.altitudeM === null) return [];
    return [{ distance: distanceFromKm(record.distanceKm, unit), altitudeM: record.altitudeM }];
  });
}

function splitDistance(segment: RunSegment, unit: DistanceUnit): string {
  if (segment.segmentStartDistanceKm !== null && segment.segmentEndDistanceKm !== null) {
    return `${distanceFromKm(segment.segmentStartDistanceKm, unit).toFixed(2)}-${distanceFromKm(segment.segmentEndDistanceKm, unit).toFixed(2)} ${unit}`;
  }

  return formatDistance(segment.segmentDistanceKm, unit);
}

function resolutionLabel(resolution: SegmentResolution, unit: DistanceUnit) {
  if (unit === "mi") return `${resolution} mi`;
  if (resolution === 0.25) return "250 m";
  if (resolution === 0.5) return "500 m";
  return "1 km";
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
  const { unit } = useDistanceUnit();
  const [resolution, setResolution] = useState<SegmentResolution>(1);
  const recordState = useRunRecords(run?.runId ?? "", open && run !== null);
  const segmentState = useRunSegments(
    run?.runId ?? "",
    unit,
    resolution,
    open && run !== null,
  );
  const elevationPoints = recordState.records ? profilePoints(recordState.records, unit) : [];

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
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-(--border) bg-(--surface) px-5 py-4">
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
              <dl className="grid border-l border-t border-(--border) sm:grid-cols-3 lg:grid-cols-6">
                {statItems(run, unit).map(([label, value]) => (
                  <div
                    key={label}
                    className="border-r border-b border-(--border) bg-(--surface-muted)/60 px-3 py-3"
                  >
                    <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-(--text-soft)">
                      {label}
                    </dt>
                    <dd className="mt-1 font-mono text-sm text-(--text)">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-mono text-xs uppercase tracking-[0.12em] text-(--text)">
                elevation_profile
              </h3>
              <p className="text-xs text-(--text-soft)">
                Built from ordered activity-record distance and altitude fields.
              </p>
            </div>
            {elevationPoints.length === 0 ? (
              <div className="border border-dashed border-(--border) bg-(--surface-muted) p-6 font-mono text-xs text-(--text-soft)">
                No elevation profile is available for this run.
              </div>
            ) : (
              <div className="h-64 border border-(--border) bg-(--surface-muted) p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={elevationPoints}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="distance"
                      tick={{ fill: "var(--text-soft)", fontSize: 12 }}
                      stroke="var(--border)"
                      tickFormatter={(value: number) => `${value.toFixed(1)} ${unit}`}
                    />
                    <YAxis
                      tick={{ fill: "var(--text-soft)", fontSize: 12 }}
                      stroke="var(--border)"
                      tickFormatter={(value: number) => `${Math.round(value)} m`}
                      width={64}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        color: "var(--text)",
                      }}
                      formatter={(value) => {
                        const numericValue = Number(value);
                        return [`${Math.round(numericValue)} m`, "Altitude"];
                      }}
                      labelFormatter={(value) => `${Number(value).toFixed(2)} ${unit}`}
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
            <div className="flex flex-wrap gap-2" role="group" aria-label="Split resolution">
              {SEGMENT_RESOLUTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={resolution === option}
                  onClick={() => setResolution(option)}
                  className={`h-8 border px-3 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors ${
                    resolution === option
                      ? "border-(--accent) bg-(--accent-soft) text-(--accent)"
                      : "border-(--border) text-(--text-soft) hover:border-(--text-soft) hover:text-(--text)"
                  }`}
                >
                  {resolutionLabel(option, unit)}
                </button>
              ))}
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
                        <th className="px-3 py-3 font-medium">Duration</th>
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
                          <td className="whitespace-nowrap px-4 py-3">
                            {formatDuration(segment.segmentDurationSeconds)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {formatPace(segment.segmentPaceMinPerKm, unit)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {formatHeartRate(segment.avgHeartRate)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {formatHeartRate(segment.maxHeartRate)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {formatElevation(segment.elevationChangeM)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {formatGrade(segment.segmentGrade)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {formatCadence(segment.avgRunningCadence)}
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
