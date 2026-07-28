"use client";

import { Filter, X } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import type { RouteSummary, RunFilterBounds } from "@/app/lib/types";
import type { DistanceUnit } from "@/app/lib/distance-unit";

import { RunFilters } from "./run-filters";

export function RunFiltersDialog({
  paramsString,
  routes,
  unit,
  bounds,
}: {
  paramsString: string;
  routes: RouteSummary[];
  unit: DistanceUnit;
  bounds: RunFilterBounds | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scrollLockRef = useRef<{
    rootOverflow: string;
    bodyOverflow: string;
  } | null>(null);

  const lockScroll = useCallback(() => {
    if (scrollLockRef.current) return;
    const root = document.documentElement;
    const body = document.body;
    scrollLockRef.current = {
      rootOverflow: root.style.overflow,
      bodyOverflow: body.style.overflow,
    };
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
  }, []);

  const releaseScroll = useCallback(() => {
    const prev = scrollLockRef.current;
    if (!prev) return;
    document.documentElement.style.overflow = prev.rootOverflow;
    document.body.style.overflow = prev.bodyOverflow;
    scrollLockRef.current = null;
  }, []);

  const open = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    lockScroll();
  }, [lockScroll]);

  const close = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  useEffect(() => {
    return () => releaseScroll();
  }, [releaseScroll]);

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label="Open filters"
        className="inline-flex h-8 w-8 items-center justify-center border border-(--border) text-(--text) transition-colors hover:border-(--text-soft) hover:bg-(--surface-muted)"
      >
        <Filter className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      <dialog
        ref={dialogRef}
        onClose={releaseScroll}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="m-auto w-[min(48rem,calc(100%-2rem))] overscroll-contain border border-(--border-strong) bg-(--surface) p-0 text-(--text) shadow-[var(--shadow-dialog)] backdrop:bg-black/70 max-h-[calc(100vh-4rem)]"
      >
        <header className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-b border-(--border) px-4 py-3">
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-(--accent)">
            Query parameters
          </p>
          <button
            type="button"
            aria-label="Close filters"
            onClick={close}
            className="col-start-2 row-span-2 row-start-1 inline-flex h-9 w-9 shrink-0 items-center justify-center border border-(--border) text-(--text-soft) transition-colors hover:bg-(--surface-muted) hover:text-(--text)"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
          <p className="mt-1 text-sm text-(--text-soft)">
            Filter sessions by date, distance, pace, heart rate, and route.
          </p>
        </header>

        <RunFilters
          embedded
          paramsString={paramsString}
          routes={routes}
          unit={unit}
          bounds={bounds}
        />
      </dialog>
    </>
  );
}
