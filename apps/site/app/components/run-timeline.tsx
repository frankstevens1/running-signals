"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  formatDate,
  formatDistance,
  formatDuration,
  formatElevation,
  formatHeartRate,
  formatPace,
  formatRouteId,
} from "@/app/lib/format";
import type { RunSession } from "@/app/lib/types";

import { ActivityRouteMap } from "./activity-route-map";
import { useDistanceUnit } from "./distance-unit-provider";
import { RunDetailDialog } from "./run-detail-dialog";
import { useRunRecords } from "./run-records-client";

function TimelineRouteMap({ runId }: { runId: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isMapActive, setIsMapActive] = useState(false);
  const [hasRequestedRecords, setHasRequestedRecords] = useState(false);
  const { records, isLoading, error } = useRunRecords(runId, hasRequestedRecords);

  useEffect(() => {
    const element = containerRef.current;

    if (!element) {
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      const fallback = setTimeout(() => {
        setIsMapActive(true);
        setHasRequestedRecords(true);
      }, 0);

      return () => clearTimeout(fallback);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const active = entries.some((entry) => entry.isIntersecting);
        setIsMapActive(active);

        if (active) {
          setHasRequestedRecords(true);
        }
      },
      { rootMargin: "180px 0px", threshold: 0 },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-56 overflow-hidden lg:h-full lg:min-h-56"
    >
      {!isMapActive ? (
        <div className="h-full bg-(--surface-muted)" />
      ) : error ? (
        <div className="flex h-full items-center justify-center bg-(--surface-muted) px-4 text-center text-sm text-(--text-soft)">
          {error}
        </div>
      ) : isLoading || !records ? (
        <div className="h-full animate-pulse bg-(--surface-muted)" />
      ) : (
        <ActivityRouteMap
          records={records}
          interactive={false}
          compact
          className="h-56 lg:h-full lg:min-h-56 bg-(--surface-muted)"
          radiusClassName="rounded-none"
        />
      )}
    </div>
  );
}

function MetricItem({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.12em] text-(--text-soft)">
        {label}
      </dt>
      <dd
        className={`mt-1 truncate font-mono text-(--text) ${emphasis ? "text-sm" : "text-xs"}`}
      >
        {value}
      </dd>
    </div>
  );
}

export function RunTimeline({ runs }: { runs: RunSession[] }) {
  const { unit } = useDistanceUnit();
  const [selectedRun, setSelectedRun] = useState<RunSession | null>(null);

  if (runs.length === 0) {
    return (
      <div className="border border-dashed border-(--border) bg-(--surface) p-8 font-mono text-xs text-(--text-soft)">
        No runs match the current filters.
      </div>
    );
  }

  return (
    <>
      <div>
        {runs.map((run, index) => (
          <article
            key={run.runId}
            className="group relative -mt-px overflow-hidden border border-(--border) bg-(--surface) transition-colors first:mt-0 hover:z-10 hover:border-(--text-soft)"
          >
            <div className="grid lg:grid-cols-[20rem_1fr]">
              <div className="border-b border-(--border) lg:border-r lg:border-b-0">
                <TimelineRouteMap runId={run.runId} />
              </div>

              <div className="min-w-0 lg:grid lg:grid-rows-[auto_minmax(0,1fr)]">
                <div className="grid gap-4 border-b border-(--border) p-4 md:grid-cols-[12rem_minmax(0,1fr)_auto] md:items-start xl:grid-cols-[14rem_minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-(--text-soft)">
                      row::{String(index + 1).padStart(2, "0")} · {formatDate(run.activityDate)}
                    </p>
                    <h3 className="mt-1 font-mono text-2xl leading-tight text-(--text)">
                      {formatDistance(run.distanceKm, unit)}
                    </h3>
                    <div className="mt-2 text-sm text-(--text-soft)">
                      {run.routeId ? (
                        <Link
                          href={`/routes?routeId=${encodeURIComponent(run.routeId)}`}
                          className="font-mono text-(--accent) hover:underline"
                        >
                          route {formatRouteId(run.routeId)}
                        </Link>
                      ) : (
                        "No route cluster"
                      )}
                    </div>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 md:self-center">
                    <MetricItem
                      label="Duration"
                      value={formatDuration(run.durationSeconds)}
                      emphasis
                    />
                    <MetricItem label="Pace" value={formatPace(run.avgPaceMinPerKm, unit)} emphasis />
                    <MetricItem label="Avg HR" value={formatHeartRate(run.avgHeartRate)} emphasis />
                    <MetricItem label="Max HR" value={formatHeartRate(run.maxHeartRate)} emphasis />
                  </dl>

                  <button
                    type="button"
                    onClick={() => setSelectedRun(run)}
                    className="inline-flex h-9 shrink-0 items-center gap-2 justify-self-start border border-(--border) px-3 font-mono text-[10px] uppercase tracking-[0.08em] text-(--text) transition-colors hover:border-(--accent) hover:bg-(--accent-soft) md:justify-self-end"
                  >
                    Detail
                    <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="p-4 lg:flex lg:items-center">
                  <dl className="grid w-full grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4 lg:grid-cols-[repeat(7,minmax(max-content,1fr))]">
                    <MetricItem label="Ascent" value={formatElevation(run.totalAscent)} />
                    <MetricItem label="Descent" value={formatElevation(run.totalDescent)} />
                    <MetricItem label="Segments" value={run.segmentCount?.toLocaleString() ?? "n/a"} />
                    <MetricItem label="Prior 7d" value={formatDistance(run.prior7dDistanceKm, unit)} />
                    <MetricItem label="Prior 28d" value={formatDistance(run.prior28dDistanceKm, unit)} />
                    <MetricItem label="Recovery HR" value={formatHeartRate(run.garminRecoveryHr)} />
                    <MetricItem
                      label="Alt range"
                      value={formatElevation(run.routeAltitudeRangeM)}
                    />
                  </dl>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      <RunDetailDialog
        run={selectedRun}
        open={selectedRun !== null}
        onClose={() => setSelectedRun(null)}
      />
    </>
  );
}
