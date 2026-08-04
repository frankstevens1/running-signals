"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { RunDataRefreshLink } from "./run-data-refresh";

const pageSizes = [25, 50, 100];

type ControlLayout = {
  top: number;
  left: number;
  width: number;
};

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

export function RunMobilePaginationControls({
  paramsString,
  total,
  limit,
  offset,
}: {
  paramsString: string;
  total: number;
  limit: number;
  offset: number;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<ControlLayout | null>(null);
  const params = new URLSearchParams(paramsString);
  const safeOffset =
    total === 0 ? 0 : Math.min(offset, Math.floor(Math.max(total - 1, 0) / limit) * limit);
  const previousOffset = Math.max(safeOffset - limit, 0);
  const nextOffset = Math.min(safeOffset + limit, Math.max(total - 1, 0));
  const hasPrevious = safeOffset > 0;
  const hasNext = safeOffset + limit < total;
  const controlClass =
    "inline-flex h-8 items-center gap-2 border border-(--border) px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-(--text) transition-colors hover:border-(--text-soft) hover:bg-(--surface-muted)";
  const disabledClass =
    "inline-flex h-8 items-center gap-2 border border-(--border) px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-(--text-soft) opacity-40";

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const anchorElement = anchor;

    let animationFrame: number | null = null;

    function updateLayout() {
      animationFrame = null;
      const anchorRect = anchorElement.getBoundingClientRect();

      if (window.innerWidth >= 1024 || anchorRect.bottom <= 0) {
        setLayout((current) => (current === null ? current : null));
        return;
      }

      const nextLayout: ControlLayout = {
        top: Math.min(window.innerHeight - anchorRect.height, anchorRect.top - 1),
        left: anchorRect.left,
        width: anchorRect.width,
      };

      setLayout((current) => {
        const isUnchanged =
          current !== null &&
          Math.abs(current.top - nextLayout.top) < 0.5 &&
          Math.abs(current.left - nextLayout.left) < 0.5 &&
          Math.abs(current.width - nextLayout.width) < 0.5;

        return isUnchanged ? current : nextLayout;
      });
    }

    function scheduleUpdate() {
      if (animationFrame === null) {
        animationFrame = window.requestAnimationFrame(updateLayout);
      }
    }

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleUpdate);
    resizeObserver?.observe(anchorElement);
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    scheduleUpdate();

    return () => {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, []);

  return (
    <>
      <div
        ref={anchorRef}
        aria-hidden="true"
        className="h-[calc(3.375rem+env(safe-area-inset-bottom))] lg:hidden"
      />

      {layout
        ? createPortal(
            <div
              data-runs-mobile-controls
              role="navigation"
              aria-label="Run page controls"
              className="fixed z-30 border border-(--border) bg-(--surface)/96 backdrop-blur-md lg:hidden"
              style={{ top: layout.top, left: layout.left, width: layout.width }}
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
                <div className="justify-self-start">
                  {hasPrevious ? (
                    <RunDataRefreshLink
                      href={hrefWith(params, { offset: previousOffset })}
                      scroll={false}
                      className={controlClass}
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                      <span className="hidden sm:inline">Previous</span>
                      <span className="sr-only sm:hidden">Previous page</span>
                    </RunDataRefreshLink>
                  ) : (
                    <span className={disabledClass}>
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                      <span className="hidden sm:inline">Previous</span>
                      <span className="sr-only sm:hidden">Previous page unavailable</span>
                    </span>
                  )}
                </div>

                <div
                  role="group"
                  aria-label="Rows per page"
                  className="flex items-center gap-0.5 justify-self-center border border-(--border) bg-(--surface-muted) p-0.5"
                >
                  {pageSizes.map((size) => (
                    <RunDataRefreshLink
                      key={size}
                      href={hrefWith(params, { limit: size, offset: 0 })}
                      scroll={false}
                      aria-label={`${size} rows per page`}
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

                <div className="justify-self-end">
                  {hasNext ? (
                    <RunDataRefreshLink
                      href={hrefWith(params, { offset: nextOffset })}
                      scroll={false}
                      className={controlClass}
                    >
                      <span className="hidden sm:inline">Next</span>
                      <span className="sr-only sm:hidden">Next page</span>
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </RunDataRefreshLink>
                  ) : (
                    <span className={disabledClass}>
                      <span className="hidden sm:inline">Next</span>
                      <span className="sr-only sm:hidden">Next page unavailable</span>
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </span>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
