import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { RunView } from "@/app/lib/query";

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
}: {
  params: URLSearchParams;
  view: RunView;
  total: number;
  limit: number;
  offset: number;
}) {
  const safeOffset = total === 0 ? 0 : Math.min(offset, Math.max(total - 1, 0));
  const currentPage = Math.floor(safeOffset / limit) + 1;
  const pageCount = Math.max(Math.ceil(total / limit), 1);
  const start = total === 0 ? 0 : safeOffset + 1;
  const end = Math.min(safeOffset + limit, total);
  const previousOffset = Math.max(safeOffset - limit, 0);
  const nextOffset = Math.min(safeOffset + limit, Math.max(total - 1, 0));
  const hasPrevious = safeOffset > 0;
  const hasNext = safeOffset + limit < total;
  const controlClass =
    "inline-flex h-9 items-center gap-2 rounded-md border border-(--border) px-3 text-sm font-semibold text-(--text) hover:bg-(--surface-muted)";
  const disabledClass =
    "inline-flex h-9 items-center gap-2 rounded-md border border-(--border) px-3 text-sm font-semibold text-(--text-soft) opacity-50";

  return (
    <div className="flex flex-col gap-3 rounded-md border border-(--border) bg-(--surface) p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="inline-flex w-fit items-center rounded-md border border-(--border) bg-(--surface-muted) p-1">
          {views.map((option) => (
            <Link
              key={option}
              href={hrefWith(params, { view: option, offset: 0 })}
              className={`inline-flex h-7 items-center rounded px-2.5 text-xs font-semibold capitalize ${
                view === option
                  ? "bg-(--accent) text-(--accent-foreground)"
                  : "text-(--text-soft) hover:bg-(--surface) hover:text-(--text)"
              }`}
            >
              {option}
            </Link>
          ))}
        </div>
        <p className="text-sm text-(--text-soft)">
          Showing <span className="font-semibold text-(--text)">{start.toLocaleString()}</span>-
          <span className="font-semibold text-(--text)">{end.toLocaleString()}</span> of{" "}
          <span className="font-semibold text-(--text)">{total.toLocaleString()}</span> runs
          <span className="ml-2 text-(--text-soft)">
            Page {currentPage.toLocaleString()} of {pageCount.toLocaleString()}
          </span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-md border border-(--border) bg-(--surface-muted) p-1">
          {pageSizes.map((size) => (
            <Link
              key={size}
              href={hrefWith(params, { limit: size, offset: 0 })}
              className={`inline-flex h-7 items-center rounded px-2 text-xs font-semibold ${
                limit === size
                  ? "bg-(--accent) text-(--accent-foreground)"
                  : "text-(--text-soft) hover:bg-(--surface) hover:text-(--text)"
              }`}
            >
              {size}
            </Link>
          ))}
        </div>
        {hasPrevious ? (
          <Link href={hrefWith(params, { offset: previousOffset })} className={controlClass}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Previous
          </Link>
        ) : (
          <span className={disabledClass}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Previous
          </span>
        )}
        {hasNext ? (
          <Link href={hrefWith(params, { offset: nextOffset })} className={controlClass}>
            Next
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : (
          <span className={disabledClass}>
            Next
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
      </div>
    </div>
  );
}
