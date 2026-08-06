"use client";

import {
  ArrowUpRight,
  Clock3,
  Footprints,
  Gauge,
  Heart,
  Mountain,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  aerobicDecouplingLevel,
  aerobicDecouplingUnavailableReason,
} from "@/app/lib/aerobic-decoupling";
import {
  formatCadence,
  formatDate,
  formatDistance,
  formatDurationClock,
  formatEconomy,
  formatElevation,
  formatHeartRate,
  formatPace,
  formatRouteId,
  formatSignedPercent,
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
        <div className="h-full bg-surface-muted" />
      ) : error ? (
        <div className="flex h-full items-center justify-center bg-surface-muted px-4 text-center text-sm text-text-soft">
          {error}
        </div>
      ) : isLoading || !records ? (
        <div className="h-full animate-pulse bg-surface-muted" />
      ) : (
        <ActivityRouteMap
          records={records}
          interactive={false}
          compact
          className="h-56 lg:h-full lg:min-h-56 bg-surface-muted"
          radiusClassName="rounded-none"
        />
      )}
    </div>
  );
}

function PrimaryMetric({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`min-w-0 last:col-span-2 sm:last:col-span-1 sm:border-l sm:border-border sm:px-5 first:sm:border-l-0 first:sm:pl-0 ${className ?? ""}`}>
      <dt className="flex items-center gap-1.5 whitespace-nowrap font-mono text-[8px] uppercase tracking-[0.08em] text-text-soft sm:gap-2 sm:text-[10px] sm:tracking-[0.1em]">
        <Icon className="h-3.5 w-3.5 text-text sm:h-4 sm:w-4" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-1.5 truncate font-mono text-sm leading-none text-text sm:mt-2 sm:text-base">
        {value}
      </dd>
    </div>
  );
}

function signalTextClassName(value: number | null): string {
  if (value === null) return "text-text-soft";
  if (value > 100) return "text-signal-ok";
  if (value < 100) return "text-signal-error";
  return "text-text";
}

function SignalMetric({
  label,
  value,
  detail,
  valueClassName,
  badge,
  className,
}: {
  label: string;
  value: string;
  detail?: ReactNode;
  valueClassName?: string;
  badge?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative min-w-0 sm:border-l sm:border-border sm:px-5 first:sm:border-l-0 first:sm:pl-0 ${className ?? ""}`}>
      <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-soft">
        {label}
      </dt>
      {badge}
      <dd className={`mt-2 truncate font-mono text-base leading-none text-text ${valueClassName ?? ""}`}>
        {value}
      </dd>
      {detail ? (
        <div className="mt-2 text-[11px] leading-4 text-text-soft">{detail}</div>
      ) : null}
    </div>
  );
}

function TrendDetail({
  delta,
  format,
  lowerIsBetter = false,
  neutral = false,
}: {
  delta: number | null;
  format: (value: number) => string;
  lowerIsBetter?: boolean;
  neutral?: boolean;
}) {
  if (delta === null) {
    return <span>No prior qualifying run</span>;
  }

  if (delta === 0) {
    return <span>-</span>;
  }

  const favorable = lowerIsBetter ? delta < 0 : delta > 0;
  const className = neutral
    ? "text-text-soft"
    : favorable
      ? "text-signal-ok"
      : "text-signal-error";

  return (
    <span className={className}>
      {format(delta)}
    </span>
  );
}

function signedFixed(value: number, decimals: number, unit: string): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(decimals)} ${unit}`;
}

function RunSignals({ run, unit }: { run: RunSession; unit: "km" | "mi" }) {
  const decoupling = run.aerobicDecouplingPct;
  const decouplingSignal = decoupling === null
      ? null
      : {
        level: aerobicDecouplingLevel(decoupling),
        value: formatSignedPercent(decoupling),
      };
  const failures = run.aerobicDecouplingFailedGates.length > 0
    ? run.aerobicDecouplingFailedGates
    : [{
        code: run.aerobicDecouplingUnavailableReason ?? "unavailable",
        observed: aerobicDecouplingUnavailableReason(run.aerobicDecouplingUnavailableReason),
        required: "Quality-gate evidence was not recorded for this run.",
  }];
  const score = run.personalEfficiencyScore;
  const eligibleSignal = run.aerobicDecouplingStatus === "eligible"
    ? decouplingSignal
    : null;

  return (
    <section aria-label="Run signals">
      <dl className="grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-4 sm:gap-x-0">
        <SignalMetric
          label="Aerobic decoupling"
          value={eligibleSignal ? eligibleSignal.value : "Not eligible"}
          detail={
            eligibleSignal
              ? (
                  <TrendDetail
                    delta={
                      run.previousAerobicDecouplingPct === null
                        ? null
                        : run.aerobicDecouplingPct! - run.previousAerobicDecouplingPct
                    }
                    format={(value) => signedFixed(value * 100, 1, "pp")}
                    lowerIsBetter
                  />
                )
              : `${failures.length} quality gate${failures.length === 1 ? "" : "s"} not met`
          }
          valueClassName={
            !eligibleSignal
              ? "text-text-soft"
              : eligibleSignal.level === "low"
                ? "text-signal-ok"
                : eligibleSignal.level === "moderate"
                  ? "text-signal-warn"
                  : "text-signal-error"
          }
        />
        <SignalMetric
          label="Dist. economy"
          value={formatEconomy(run.distanceEconomyMperBeat, 3, "m/beat")}
          detail={
            <TrendDetail
              delta={
                run.distanceEconomyMperBeat === null || run.previousDistanceEconomyMperBeat === null
                  ? null
                  : run.distanceEconomyMperBeat - run.previousDistanceEconomyMperBeat
              }
              format={(value) => signedFixed(value, 3, "m/beat")}
            />
          }
          badge={
            score === null ? null : (
              <span className={`absolute right-0 top-0 bg-surface-muted px-1.5 py-1 font-mono text-[9px] ${signalTextClassName(score)}`}>
                {Math.round(score)}
              </span>
            )
          }
        />
        <SignalMetric
          label="Elev. economy"
          value={formatEconomy(run.elevationEconomyMperBeat, 4, "m/beat")}
          className="hidden sm:block"
          detail={
            <TrendDetail
              delta={
                run.elevationEconomyMperBeat === null || run.previousElevationEconomyMperBeat === null
                  ? null
                  : run.elevationEconomyMperBeat - run.previousElevationEconomyMperBeat
              }
              format={(value) => signedFixed(value, 4, "m/beat")}
            />
          }
        />
        <SignalMetric
          label="Prior 7 days"
          value={formatDistance(run.prior7dDistanceKm, unit)}
          className="hidden sm:block"
          detail={
            <TrendDetail
              delta={
                run.prior7dDistanceKm === null || run.previousPrior7dDistanceKm === null
                  ? null
                  : run.prior7dDistanceKm - run.previousPrior7dDistanceKm
              }
              format={(value) => `${value > 0 ? "+" : value < 0 ? "-" : ""}${formatDistance(Math.abs(value), unit)}`}
              neutral
            />
          }
        />
      </dl>
      {!eligibleSignal ? (
        <div className="mt-5 border-t border-border pt-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-soft">
            Decoupling quality gates
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-text-soft">
            {failures.map((failure) => (
              <li key={failure.code}>
                <span className="text-text">{failure.observed}</span>
                <span> - needs {failure.required}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
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
    let snapTargetScroll: number | null = null;

    function updateSnapViewport() {
      animationFrame = null;
      if (snapTargetScroll !== null) {
        const currentScroll = window.scrollY || document.documentElement.scrollTop;
        if (Math.abs(currentScroll - snapTargetScroll) < 2) {
          snapTargetScroll = null;
        }
      }
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
      if (snapTargetScroll !== null) {
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

      event.preventDefault();
      snapTargetScroll = targetScrollTop;
      window.scrollTo({ top: targetScrollTop, behavior: "instant" });
      setTimeout(() => {
        snapTargetScroll = null;
      }, 400);
      scheduleUpdate();
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
      <div className="border border-dashed border-border bg-surface p-8 font-mono text-xs text-text-soft">
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
            className="group relative -mt-px overflow-hidden border border-border bg-surface transition-colors first:mt-0 hover:z-10 hover:border-text-soft"
          >
            <div className="grid lg:grid-cols-[20rem_1fr]">
              <div className="border-b border-border lg:border-r lg:border-b-0">
                <TimelineRouteMap runId={run.runId} />
              </div>

              <div className="min-w-0">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-soft">
                        row::{String(index + 1).padStart(2, "0")} · {formatDate(run.activityDate)}
                      </p>
                      <h3 className="mt-1 font-mono text-2xl leading-tight text-text">
                        {formatDistance(run.distanceKm, unit)}
                      </h3>
                      <div className="mt-2 text-sm text-text-soft">
                        {run.routeId ? (
                          <Link
                            href={`/routes?routeId=${encodeURIComponent(run.routeId)}`}
                            className="font-mono text-accent hover:underline"
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
                      className="inline-flex h-9 shrink-0 items-center gap-2 border border-border px-3 font-mono text-[10px] uppercase tracking-[0.08em] text-text transition-colors hover:border-accent hover:bg-accent-soft"
                    >
                      Detail
                      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>

                  <section className="mt-6" aria-label="Run metrics">
                    <dl className="grid grid-cols-4 gap-x-3 border-b border-border pb-5 sm:grid-cols-5 sm:gap-x-0">
                      <PrimaryMetric
                        icon={Clock3}
                        label="Duration"
                        value={formatDurationClock(run.durationSeconds)}
                      />
                      <PrimaryMetric
                        icon={Gauge}
                        label="Avg pace"
                        value={formatPace(run.avgPaceMinPerKm, unit)}
                      />
                      <PrimaryMetric
                        icon={Heart}
                        label="Avg HR"
                        value={formatHeartRate(run.avgHeartRate)}
                      />
                      <PrimaryMetric
                        icon={Mountain}
                        label="Elev gain"
                        value={formatElevation(run.totalAscent)}
                      />
                      <PrimaryMetric
                        icon={Footprints}
                        label="Avg cadence"
                        value={formatCadence(run.avgCadence)}
                        className="hidden sm:block"
                      />
                    </dl>
                    <div className="pt-5">
                      <RunSignals run={run} unit={unit} />
                    </div>
                  </section>
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
