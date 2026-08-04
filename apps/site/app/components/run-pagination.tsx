import { ChevronLeft, ChevronRight } from "lucide-react";

import type { RunView } from "@/app/lib/query";
import type { RouteSummary, RunFilterBounds } from "@/app/lib/types";
import type { DistanceUnit } from "@/app/lib/distance-unit";

import { RunFiltersDialog } from "./run-filters-dialog";
import { RunDataRefreshLink } from "./run-data-refresh";
import { RunTimelineSortDialog, RunTimelineSortDropdown } from "./run-timeline-sort";

const pageSizes = [25, 50, 100];
const views: RunView[] = ["timeline", "table"];

function hrefWith(params: URLSearchParams, updates: Record<string, string | number | null>) {
  const next = new URLSearchParams(params);

  for (const [key, value] of Object.entries(updates)) {
    if (value === null) {
      next.delete(key);
    } else {
      next.set(key, String(value));
    }
  }

  return `/runs?${next.toString()}`;
}

export function RunPagination({
  params,
  view,
  total,
  limit,
  offset,
  comparisonTotal,
  paramsString,
  routes,
  unit,
  bounds,
}: {
  params: URLSearchParams;
  view: RunView;
  total: number;
  limit: number;
  offset: number;
  comparisonTotal: number | null;
  paramsString: string;
  routes: RouteSummary[];
  unit: DistanceUnit;
  bounds: RunFilterBounds | null;
}) {
  const safeOffset = total === 0 ? 0 : Math.min(offset, Math.floor(Math.max(total - 1, 0) / limit) * limit);
  const currentPage = Math.floor(safeOffset / limit) + 1;
  const pageCount = Math.max(Math.ceil(total / limit), 1);
  const start = total === 0 ? 0 : safeOffset + 1;
  const end = Math.min(safeOffset + limit, total);
  const previousOffset = Math.max(safeOffset - limit, 0);
  const nextOffset = Math.min(safeOffset + limit, Math.max(total - 1, 0));
  const hasPrevious = safeOffset > 0;
  const hasNext = safeOffset + limit < total;
  const controlClass =
    "inline-flex h-8 items-center gap-2 border border-(--border) px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-(--text) transition-colors hover:border-(--text-soft) hover:bg-(--surface-muted)";
  const disabledClass =
    "inline-flex h-8 items-center gap-2 border border-(--border) px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-(--text-soft) opacity-40";

  return (
    <>
      <div
        data-runs-pagination
        className="sticky top-[calc(4rem+2.75rem+1px)] z-30 border border-(--border) bg-(--surface) px-3 py-2.5 sm:px-4 lg:top-28"
      >
      {/* Desktop: original flat layout */}
      <div className="hidden lg:flex lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="inline-flex w-fit items-center border border-(--border) bg-(--surface-muted) p-0.5">
            {views.map((option) => (
              <RunDataRefreshLink
                key={option}
                href={hrefWith(params, { view: option, offset: 0 })}
                scroll={false}
                className={`inline-flex h-7 items-center px-2.5 font-mono text-[10px] uppercase tracking-[0.08em] ${
                  view === option
                    ? "bg-(--accent) text-(--accent-foreground)"
                    : "text-(--text-soft) hover:bg-(--surface) hover:text-(--text)"
                }`}
              >
                {option}
              </RunDataRefreshLink>
            ))}
          </div>
          <div className="flex items-center gap-0.5 border border-(--border) bg-(--surface-muted) p-0.5">
            {pageSizes.map((size) => (
              <RunDataRefreshLink
                key={size}
                href={hrefWith(params, { limit: size, offset: 0 })}
                scroll={false}
                className={`inline-flex h-7 items-center px-2 font-mono text-[10px] font-semibold ${
                  limit === size
                    ? "bg-(--accent) text-(--accent-foreground)"
                    : "text-(--text-soft) hover:bg-(--surface) hover:text-(--text)"
                }`}
              >
                {size}
              </RunDataRefreshLink>
            ))}
          </div>
          <p className="font-mono text-[11px] text-(--text-soft)">
            rows <span className="text-(--text)">{start.toLocaleString()}</span>-
            <span className="text-(--text)">{end.toLocaleString()}</span> /{" "}
            <span className="text-(--text)">{total.toLocaleString()}</span>
            <span className="ml-3 text-(--text-soft)">
              page {currentPage.toLocaleString()}:{pageCount.toLocaleString()}
            </span>
            {comparisonTotal !== null ? (
              <span className="ml-3 text-(--text-soft)">
                comparison {comparisonTotal.toLocaleString()} ({total - comparisonTotal >= 0 ? "+" : ""}
                {(total - comparisonTotal).toLocaleString()})
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {view === "timeline" ? <RunTimelineSortDropdown paramsString={paramsString} /> : null}
          {hasPrevious ? (
            <RunDataRefreshLink
              href={hrefWith(params, { offset: previousOffset })}
              scroll={false}
              className={controlClass}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Previous
            </RunDataRefreshLink>
          ) : (
            <span className={disabledClass}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Previous
            </span>
          )}
          {hasNext ? (
            <RunDataRefreshLink
              href={hrefWith(params, { offset: nextOffset })}
              scroll={false}
              className={controlClass}
            >
              Next
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </RunDataRefreshLink>
          ) : (
            <span className={disabledClass}>
              Next
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </span>
          )}
        </div>
      </div>

        {/* Mobile: controls with a compact two-row result summary */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 lg:hidden">
          <div className="inline-flex w-fit items-center justify-self-start border border-(--border) bg-(--surface-muted) p-0.5">
            {views.map((option) => (
              <RunDataRefreshLink
                key={option}
                href={hrefWith(params, { view: option, offset: 0 })}
                scroll={false}
                className={`inline-flex h-7 items-center px-1.5 font-mono text-[8px] uppercase tracking-[0.08em] sm:px-2 sm:text-[9px] ${
                  view === option
                    ? "bg-(--accent) text-(--accent-foreground)"
                    : "text-(--text-soft) hover:bg-(--surface) hover:text-(--text)"
                }`}
              >
                {option}
              </RunDataRefreshLink>
            ))}
          </div>

          <div className="grid grid-rows-2 justify-self-center text-center font-mono text-[8px] leading-[11px] text-(--text-soft) sm:text-[9px] sm:leading-[12px]">
            <p className="whitespace-nowrap">
              rows <span className="text-(--text)">{start}-{end}/{total}</span>
            </p>
            <p className="whitespace-nowrap">
              page <span className="text-(--text)">{currentPage}/{pageCount}</span>
            </p>
          </div>

          <div className="flex items-center gap-1 justify-self-end">
            {view === "timeline" ? <RunTimelineSortDialog paramsString={paramsString} /> : null}
            <RunFiltersDialog
              paramsString={paramsString}
              routes={routes}
              unit={unit}
              bounds={bounds}
            />
          </div>
        </div>
      </div>

    </>
  );
}
