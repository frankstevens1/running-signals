"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  formatDate,
  formatDistance,
  formatDuration,
  formatEconomy,
  formatElevation,
  formatHeartRate,
  formatPace,
  formatRouteId,
} from "@/app/lib/format";
import type { RunSession } from "@/app/lib/types";

import { ActivityRouteMap } from "./activity-route-map";
import { useDistanceUnit } from "./distance-unit-provider";
import { RunDetailDialog } from "./run-detail-dialog";
import { useRunRecords } from "@/app/lib/run-records-client";

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
  className,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.12em] text-(--text-soft)">
        {label}
      </dt>
      <dd
        className={`mt-1 truncate font-mono text-(--text) ${emphasis ? "text-sm" : "text-xs"} ${className ?? ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

export function RunTimeline({ runs }: { runs: RunSession[] }) {
  const { unit } = useDistanceUnit();
  const [selectedRun, setSelectedRun] = useState<RunSession | null>(null);

  useEffect(() => {
    if (runs.length === 0) return;

    const root = document.documentElement;
    const appHeader = document.querySelector<HTMLElement>("[data-app-header]");
    const pagination = document.querySelector<HTMLElement>("[data-runs-pagination]");

    if (!appHeader || !pagination) return;

    const appHeaderElement = appHeader;
    const paginationElement = pagination;

    const previousSnapAttribute = root.getAttribute("data-runs-timeline-snap");
    const previousSnapTop = root.style.getPropertyValue("--runs-timeline-snap-top");
    const previousSnapBottom = root.style.getPropertyValue("--runs-timeline-snap-bottom");
    let animationFrame: number | null = null;
    let lastSnapScrollTime = 0;
    const SNAP_SCROLL_COOLDOWN = 400;

    function updateSnapViewport() {
      animationFrame = null;
      const headerRect = appHeaderElement.getBoundingClientRect();
      const paginationRect = paginationElement.getBoundingClientRect();
      const controls = document.querySelector<HTMLElement>("[data-runs-mobile-controls]");
      const isMobile = window.innerWidth < 1024;
      const isPaginationPinned = paginationRect.top <= headerRect.bottom + 1;

      if (!isMobile || !isPaginationPinned) {
        root.removeAttribute("data-runs-timeline-snap");
        return;
      }

      root.setAttribute("data-runs-timeline-snap", "");
      root.style.setProperty("--runs-timeline-snap-top", `${paginationRect.bottom}px`);
      root.style.setProperty(
        "--runs-timeline-snap-bottom",
        controls ? `${controls.getBoundingClientRect().height}px` : "0px",
      );
    }

    function scheduleUpdate() {
      if (animationFrame === null) {
        animationFrame = window.requestAnimationFrame(updateSnapViewport);
      }
    }

    function handleWheel(event: WheelEvent) {
      if (!root.hasAttribute("data-runs-timeline-snap")) return;

      const now = performance.now();
      if (now - lastSnapScrollTime < SNAP_SCROLL_COOLDOWN) {
        event.preventDefault();
        return;
      }

      const direction = event.deltaY > 0 ? 1 : -1;
      const items = Array.from(
        document.querySelectorAll<HTMLElement>("[data-run-timeline-item]"),
      );
      if (items.length === 0) return;

      const snapTop =
        parseFloat(root.style.getPropertyValue("--runs-timeline-snap-top")) || 0;

      let anchorIndex = 0;
      let minDistance = Infinity;
      for (let i = 0; i < items.length; i++) {
        const rect = items[i].getBoundingClientRect();
        const distance = Math.abs(rect.top - snapTop);
        if (distance < minDistance) {
          minDistance = distance;
          anchorIndex = i;
        }
      }

      const targetIndex = Math.max(
        0,
        Math.min(items.length - 1, anchorIndex + direction),
      );

      if (targetIndex === anchorIndex) return;

      const targetRect = items[targetIndex].getBoundingClientRect();
      const targetScrollTop =
        (window.scrollY || document.documentElement.scrollTop) +
        targetRect.top -
        snapTop;

      lastSnapScrollTime = now;
      event.preventDefault();
      window.scrollTo({ top: targetScrollTop, behavior: "smooth" });
    }

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleUpdate);
    resizeObserver?.observe(appHeaderElement);
    resizeObserver?.observe(paginationElement);

    const mutationObserver = new MutationObserver(scheduleUpdate);
    mutationObserver.observe(document.body, { childList: true });

    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("wheel", handleWheel, { passive: false });
    scheduleUpdate();

    return () => {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("wheel", handleWheel);

      if (previousSnapAttribute === null) {
        root.removeAttribute("data-runs-timeline-snap");
      } else {
        root.setAttribute("data-runs-timeline-snap", previousSnapAttribute);
      }

      if (previousSnapTop) {
        root.style.setProperty("--runs-timeline-snap-top", previousSnapTop);
      } else {
        root.style.removeProperty("--runs-timeline-snap-top");
      }

      if (previousSnapBottom) {
        root.style.setProperty("--runs-timeline-snap-bottom", previousSnapBottom);
      } else {
        root.style.removeProperty("--runs-timeline-snap-bottom");
      }
    };
  }, [runs.length]);

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
            data-run-timeline-item
            className="group relative -mt-px overflow-hidden border border-(--border) bg-(--surface) transition-colors first:mt-0 hover:z-10 hover:border-(--text-soft)"
          >
            <div className="grid lg:grid-cols-[20rem_1fr]">
              <div className="border-b border-(--border) lg:border-r lg:border-b-0">
                <TimelineRouteMap runId={run.runId} />
              </div>

              <div className="min-w-0 lg:grid lg:grid-rows-[auto_minmax(0,1fr)]">
                {/* Desktop: 3-column grid with Detail button as third column */}
                <div className="hidden gap-4 border-b border-(--border) p-4 lg:grid md:grid-cols-[12rem_minmax(0,1fr)_auto] md:items-start xl:grid-cols-[14rem_minmax(0,1fr)_auto]">
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

                {/* Mobile: stacked layout with Detail button inline next to date */}
                <div className="border-b border-(--border) p-4 lg:hidden">
                  <div className="flex items-start justify-between gap-3">
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
                    <button
                      type="button"
                      onClick={() => setSelectedRun(run)}
                      className="inline-flex h-9 shrink-0 items-center gap-2 border border-(--border) px-3 font-mono text-[10px] uppercase tracking-[0.08em] text-(--text) transition-colors hover:border-(--accent) hover:bg-(--accent-soft)"
                    >
                      Detail
                      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>

                  <dl className="mt-4 grid grid-cols-4 gap-x-2 gap-y-3 sm:gap-x-6">
                    <MetricItem
                      label="Duration"
                      value={formatDuration(run.durationSeconds)}
                      emphasis
                    />
                    <MetricItem label="Pace" value={formatPace(run.avgPaceMinPerKm, unit)} emphasis />
                    <MetricItem label="Avg HR" value={formatHeartRate(run.avgHeartRate)} emphasis />
                    <MetricItem label="Max HR" value={formatHeartRate(run.maxHeartRate)} emphasis />
                  </dl>
                </div>

                <div className="p-4 lg:flex lg:items-center">
                  <dl className="grid w-full grid-cols-3 gap-x-4 gap-y-3 sm:gap-x-5 lg:grid-cols-6">
                    <MetricItem
                      label="Dist economy"
                      value={formatEconomy(run.distanceEconomyMperBeat, 3, "m/beat")}
                    />
                    <MetricItem
                      label="Elev economy"
                      value={formatEconomy(run.elevationEconomyMperBeat, 4, "m/beat")}
                    />
                    <MetricItem
                      label="Score"
                      value={
                        run.personalEfficiencyScore != null
                          ? `${Math.round(run.personalEfficiencyScore)}`
                          : "\u2014"
                      }
                      className={
                        run.personalEfficiencyScore != null
                          ? run.personalEfficiencyScore > 100
                            ? "text-(--signal-ok)"
                            : run.personalEfficiencyScore < 100
                              ? "text-(--signal-error)"
                              : "text-(--text-soft)"
                          : ""
                      }
                    />
                    <MetricItem label="Prior 7d" value={formatDistance(run.prior7dDistanceKm, unit)} />
                    <MetricItem label="Recovery HR" value={formatHeartRate(run.garminRecoveryHr)} />
                    <MetricItem
                      label="Ascent/Descent"
                      value={[
                        formatElevation(run.totalAscent),
                        formatElevation(run.totalDescent),
                      ].join(" / ")}
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
