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

import { RunDetailDialog } from "./run-detail-dialog";
import { RunSegmentMap } from "./run-segment-map";
import { useRunSegments } from "./run-segments-client";

function TimelineRouteMap({ runId }: { runId: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isMapActive, setIsMapActive] = useState(false);
  const [hasRequestedSegments, setHasRequestedSegments] = useState(false);
  const { segments, isLoading, error } = useRunSegments(runId, hasRequestedSegments);

  useEffect(() => {
    const element = containerRef.current;

    if (!element) {
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      const fallback = setTimeout(() => {
        setIsMapActive(true);
        setHasRequestedSegments(true);
      }, 0);

      return () => clearTimeout(fallback);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const active = entries.some((entry) => entry.isIntersecting);
        setIsMapActive(active);

        if (active) {
          setHasRequestedSegments(true);
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
      className="h-56 overflow-hidden rounded-l-md rounded-r-none lg:h-full lg:min-h-56"
    >
      {!isMapActive ? (
        <div className="h-full bg-(--surface-muted)" />
      ) : error ? (
        <div className="flex h-full items-center justify-center bg-(--surface-muted) px-4 text-center text-sm text-(--text-soft)">
          {error}
        </div>
      ) : isLoading || !segments ? (
        <div className="h-full animate-pulse bg-(--surface-muted)" />
      ) : (
        <RunSegmentMap
          segments={segments}
          interactive={false}
          compact
          className="h-56 lg:h-full lg:min-h-56 bg-(--surface-muted)"
          radiusClassName="rounded-l-md rounded-r-none"
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
      <dt className="whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.12em] text-(--text-soft)">
        {label}
      </dt>
      <dd
        className={`mt-1 truncate font-semibold text-(--text) ${emphasis ? "text-base" : "text-sm"}`}
      >
        {value}
      </dd>
    </div>
  );
}

export function RunTimeline({ runs }: { runs: RunSession[] }) {
  const [selectedRun, setSelectedRun] = useState<RunSession | null>(null);

  if (runs.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-(--border) bg-(--surface) p-8 text-sm text-(--text-soft)">
        No runs match the current filters.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {runs.map((run) => (
          <article
            key={run.runId}
            className="overflow-hidden rounded-md border border-(--border) bg-(--surface)"
          >
            <div className="grid lg:grid-cols-[20rem_1fr]">
              <div className="border-b border-(--border) lg:border-r lg:border-b-0">
                <TimelineRouteMap runId={run.runId} />
              </div>

              <div className="min-w-0 lg:grid lg:grid-rows-[auto_minmax(0,1fr)]">
                <div className="grid gap-4 border-b border-(--border) p-4 md:grid-cols-[12rem_minmax(0,1fr)_auto] md:items-start xl:grid-cols-[14rem_minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-(--text-soft)">
                      {formatDate(run.activityDate)}
                    </p>
                    <h3 className="mt-1 text-2xl font-semibold leading-tight text-(--text)">
                      {formatDistance(run.distanceKm)}
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
                    <MetricItem label="Pace" value={formatPace(run.avgPaceMinPerKm)} emphasis />
                    <MetricItem label="Avg HR" value={formatHeartRate(run.avgHeartRate)} emphasis />
                    <MetricItem label="Max HR" value={formatHeartRate(run.maxHeartRate)} emphasis />
                  </dl>

                  <button
                    type="button"
                    onClick={() => setSelectedRun(run)}
                    className="inline-flex h-9 shrink-0 items-center gap-2 justify-self-start rounded-md border border-(--border) px-3 text-sm font-medium text-(--text) hover:bg-(--surface-muted) md:justify-self-end"
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
                    <MetricItem label="Prior 7d" value={formatDistance(run.prior7dDistanceKm)} />
                    <MetricItem label="Prior 28d" value={formatDistance(run.prior28dDistanceKm)} />
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
