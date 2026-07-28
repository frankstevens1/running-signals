"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { DistanceUnit } from "@/app/lib/distance-unit";
import {
  formatDate,
  formatDistance,
  formatHeartRate,
  formatPace,
  formatRouteId,
} from "@/app/lib/format";
import type { RunSort, SortDirection } from "@/app/lib/query";
import type { RunSession } from "@/app/lib/types";

const sortableColumns: Array<{
  sort: RunSort;
  label: string;
  defaultDirection: SortDirection;
}> = [
  { sort: "activity_date", label: "Date", defaultDirection: "desc" },
  { sort: "distance_km", label: "Distance", defaultDirection: "desc" },
  { sort: "avg_pace_min_per_km", label: "Pace", defaultDirection: "asc" },
  { sort: "avg_heart_rate", label: "Avg HR", defaultDirection: "desc" },
  { sort: "total_ascent", label: "Ascent", defaultDirection: "desc" },
  { sort: "prior_28d_distance_km", label: "Prior 28d", defaultDirection: "desc" },
  { sort: "route_id", label: "Route", defaultDirection: "asc" },
];

type StickyHeaderLayout = {
  top: number;
  left: number;
  width: number;
  tableWidth: number;
  scrollLeft: number;
  columnWidths: number[];
};

function sortHref(params: URLSearchParams, sort: RunSort, nextDirection: SortDirection): string {
  const nextParams = new URLSearchParams(params);
  nextParams.set("sort", sort);
  nextParams.set("direction", nextDirection);
  nextParams.delete("offset");
  return `/runs?${nextParams.toString()}`;
}

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />;
  if (direction === "asc") return <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />;
  return <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />;
}

function sortState(
  params: URLSearchParams,
  sort: RunSort,
  defaultDirection: SortDirection,
) {
  const active = params.get("sort") === sort || (!params.get("sort") && sort === "activity_date");
  const direction = params.get("direction") === "asc" ? "asc" : "desc";

  return {
    active,
    direction,
    nextDirection: active && direction === "desc" ? "asc" : defaultDirection,
    ariaSort: active ? (direction === "asc" ? "ascending" : "descending") : "none",
  } as const;
}

function SortLink({
  params,
  sort,
  label,
  defaultDirection,
  tabIndex,
}: {
  params: URLSearchParams;
  sort: RunSort;
  label: string;
  defaultDirection: SortDirection;
  tabIndex?: number;
}) {
  const { active, direction, nextDirection } = sortState(params, sort, defaultDirection);

  return (
    <Link
      href={sortHref(params, sort, nextDirection)}
      scroll={false}
      tabIndex={tabIndex}
      className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap px-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-(--text-soft) hover:bg-(--surface) hover:text-(--text)"
    >
      <span>{label}</span>
      <SortIcon active={active} direction={direction} />
    </Link>
  );
}

function SortableHeader({
  params,
  sort,
  label,
  defaultDirection,
  tabIndex,
}: {
  params: URLSearchParams;
  sort: RunSort;
  label: string;
  defaultDirection: SortDirection;
  tabIndex?: number;
}) {
  const { ariaSort } = sortState(params, sort, defaultDirection);

  return (
    <th className="whitespace-nowrap px-3 py-2.5 font-normal" aria-sort={ariaSort}>
      <SortLink
        params={params}
        sort={sort}
        label={label}
        defaultDirection={defaultDirection}
        tabIndex={tabIndex}
      />
    </th>
  );
}

export function RunTable({
  runs,
  paramsString,
  unit,
}: {
  runs: RunSession[];
  paramsString: string;
  unit: DistanceUnit;
}) {
  const params = new URLSearchParams(paramsString);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const headerRef = useRef<HTMLTableSectionElement>(null);
  const [stickyHeader, setStickyHeader] = useState<StickyHeaderLayout | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const table = tableRef.current;
    const header = headerRef.current;
    const pagination = document.querySelector<HTMLElement>("[data-runs-pagination]");

    if (!wrapper || !table || !header || !pagination) return;

    const wrapperElement = wrapper;
    const tableElement = table;
    const headerElement = header;
    const paginationElement = pagination;

    let animationFrame: number | null = null;

    function updateStickyHeader() {
      animationFrame = null;

      const paginationRect = paginationElement.getBoundingClientRect();
      const headerRect = headerElement.getBoundingClientRect();
      const tableRect = tableElement.getBoundingClientRect();
      const wrapperRect = wrapperElement.getBoundingClientRect();
      const stickyTop = paginationRect.bottom;
      const isStuck = headerRect.top <= stickyTop && tableRect.bottom > stickyTop;

      if (!isStuck) {
        setStickyHeader((current) => (current === null ? current : null));
        return;
      }

      const columnWidths = Array.from(
        headerElement.querySelectorAll<HTMLTableCellElement>("th"),
        (cell) => cell.getBoundingClientRect().width,
      );
      const left = wrapperRect.left + wrapperElement.clientLeft;
      const nextLayout: StickyHeaderLayout = {
        top: Math.min(stickyTop, tableRect.bottom - headerRect.height),
        left,
        width: Math.min(wrapperElement.clientWidth, Math.max(window.innerWidth - left, 0)),
        tableWidth: tableElement.getBoundingClientRect().width,
        scrollLeft: wrapperElement.scrollLeft,
        columnWidths,
      };

      setStickyHeader((current) => {
        const isUnchanged =
          current !== null &&
          Math.abs(current.top - nextLayout.top) < 0.5 &&
          Math.abs(current.left - nextLayout.left) < 0.5 &&
          Math.abs(current.width - nextLayout.width) < 0.5 &&
          Math.abs(current.tableWidth - nextLayout.tableWidth) < 0.5 &&
          Math.abs(current.scrollLeft - nextLayout.scrollLeft) < 0.5 &&
          current.columnWidths.length === nextLayout.columnWidths.length &&
          current.columnWidths.every(
            (width, index) => Math.abs(width - nextLayout.columnWidths[index]) < 0.5,
          );

        return isUnchanged ? current : nextLayout;
      });
    }

    function scheduleUpdate() {
      if (animationFrame === null) {
        animationFrame = window.requestAnimationFrame(updateStickyHeader);
      }
    }

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleUpdate);
    resizeObserver?.observe(paginationElement);
    resizeObserver?.observe(wrapperElement);
    resizeObserver?.observe(tableElement);

    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    wrapperElement.addEventListener("scroll", scheduleUpdate, { passive: true });
    scheduleUpdate();

    return () => {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      wrapperElement.removeEventListener("scroll", scheduleUpdate);
    };
  }, [paramsString, runs, unit]);

  if (runs.length === 0) {
    return (
      <div className="border border-dashed border-(--border) bg-(--surface) p-8 font-mono text-xs text-(--text-soft)">
        No runs match the current filters.
      </div>
    );
  }

  return (
    <>
      <div
        ref={wrapperRef}
        className="overflow-x-auto border border-(--border) bg-(--surface)"
      >
        <table ref={tableRef} className="min-w-full divide-y divide-(--border) text-sm">
          <thead
            ref={headerRef}
            aria-hidden={stickyHeader ? true : undefined}
            className={`border-b border-(--border) bg-(--surface-muted) text-left text-(--text-soft) ${
              stickyHeader ? "invisible" : ""
            }`}
          >
            <tr>
              {sortableColumns.map((column) => (
                <SortableHeader
                  key={column.sort}
                  params={params}
                  tabIndex={stickyHeader ? -1 : undefined}
                  {...column}
                />
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-(--border)">
            {runs.map((run) => (
              <tr key={run.runId} className="font-mono text-xs transition-colors hover:bg-(--accent-soft)">
                <td className="whitespace-nowrap px-4 py-3 text-(--text)">
                  {formatDate(run.activityDate)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">{formatDistance(run.distanceKm, unit)}</td>
                <td className="whitespace-nowrap px-4 py-3">{formatPace(run.avgPaceMinPerKm, unit)}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  {formatHeartRate(run.avgHeartRate)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {run.totalAscent === null ? "n/a" : `${Math.round(run.totalAscent)} m`}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {formatDistance(run.prior28dDistanceKm, unit)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {run.routeId ? (
                    <Link
                      href={`/routes?routeId=${encodeURIComponent(run.routeId)}`}
                      className="font-mono text-(--accent) hover:underline"
                    >
                      {formatRouteId(run.routeId)}
                    </Link>
                  ) : (
                    "n/a"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {stickyHeader
        ? createPortal(
            <div
              role="table"
              aria-label="Runs table sticky header"
              className="fixed z-[25] overflow-hidden border-x border-b border-(--border) bg-(--surface-muted) shadow-[var(--shadow-header)]"
              style={{
                top: stickyHeader.top,
                left: stickyHeader.left,
                width: stickyHeader.width,
              }}
            >
              <div role="rowgroup">
                <div
                  role="row"
                  className="flex text-left text-(--text-soft)"
                  style={{
                    width: stickyHeader.tableWidth,
                    transform: `translateX(${-stickyHeader.scrollLeft}px)`,
                  }}
                >
                  {sortableColumns.map((column, index) => {
                    const { ariaSort } = sortState(
                      params,
                      column.sort,
                      column.defaultDirection,
                    );

                    return (
                      <div
                        key={column.sort}
                        role="columnheader"
                        aria-sort={ariaSort}
                        className="shrink-0 whitespace-nowrap px-3 py-2.5 font-normal"
                        style={{ width: stickyHeader.columnWidths[index] }}
                      >
                        <SortLink params={params} {...column} />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
