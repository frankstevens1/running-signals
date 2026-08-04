"use client";

import { ArrowDown, ArrowDownUp, ArrowUp, X } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import type { RunSort } from "@/app/lib/query";
import { RUN_TABLE_SORT_OPTIONS, getRunSortState, hrefWithRunSort } from "@/app/lib/run-sort";

import { RunDataRefreshLink, useRunDataRefreshNavigate } from "./run-data-refresh";

function activeSort(params: URLSearchParams): RunSort {
  const selected = params.get("sort");
  return RUN_TABLE_SORT_OPTIONS.find((option) => option.sort === selected)?.sort ?? "activity_date";
}

export function RunTimelineSortDropdown({ paramsString }: { paramsString: string }) {
  const params = new URLSearchParams(paramsString);
  const { navigate } = useRunDataRefreshNavigate();
  const selectedSort = activeSort(params);
  const selectedOption = RUN_TABLE_SORT_OPTIONS.find((option) => option.sort === selectedSort)!;
  const { direction } = getRunSortState(
    params,
    selectedOption.sort,
    selectedOption.defaultDirection,
  );

  return (
    <div className="flex h-8 items-center gap-2">
      <label className="inline-flex h-8 items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-text-soft">
        <span>Sort</span>
        <select
          value={selectedSort}
          aria-label="Sort timeline by"
          onChange={(event) => {
            const option = RUN_TABLE_SORT_OPTIONS.find((item) => item.sort === event.target.value);
            if (!option || option.sort === selectedSort) return;
            navigate(hrefWithRunSort(params, option.sort, option.defaultDirection));
          }}
          className="h-8 border border-border bg-background px-2 font-mono text-[10px] uppercase tracking-[0.06em] text-text outline-none focus:border-accent"
        >
          {RUN_TABLE_SORT_OPTIONS.map((option) => (
            <option key={option.sort} value={option.sort}>{option.label}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        aria-label={`Change timeline sort direction from ${direction === "asc" ? "ascending" : "descending"}`}
        title={`Sort ${direction === "asc" ? "ascending" : "descending"}`}
        onClick={() => navigate(hrefWithRunSort(
          params,
          selectedSort,
          direction === "asc" ? "desc" : "asc",
        ))}
        className="inline-flex h-8 w-8 items-center justify-center border border-border text-text-soft transition-colors hover:border-text-soft hover:bg-surface-muted hover:text-text"
      >
        {direction === "asc"
          ? <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
          : <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />}
      </button>
    </div>
  );
}

export function RunTimelineSortDialog({ paramsString }: { paramsString: string }) {
  const params = new URLSearchParams(paramsString);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const scrollLockRef = useRef<{ rootOverflow: string; bodyOverflow: string } | null>(null);
  const { navigate } = useRunDataRefreshNavigate();
  const selectedSort = activeSort(params);
  const selectedOption = RUN_TABLE_SORT_OPTIONS.find((option) => option.sort === selectedSort)!;
  const { direction } = getRunSortState(
    params,
    selectedOption.sort,
    selectedOption.defaultDirection,
  );

  const lockScroll = useCallback(() => {
    if (scrollLockRef.current) return;
    const root = document.documentElement;
    const body = document.body;
    scrollLockRef.current = { rootOverflow: root.style.overflow, bodyOverflow: body.style.overflow };
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
  }, []);

  const releaseScroll = useCallback(() => {
    const previous = scrollLockRef.current;
    if (!previous) return;
    document.documentElement.style.overflow = previous.rootOverflow;
    document.body.style.overflow = previous.bodyOverflow;
    scrollLockRef.current = null;
  }, []);

  const open = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    lockScroll();
  }, [lockScroll]);

  const close = useCallback(() => dialogRef.current?.close(), []);

  useEffect(() => () => releaseScroll(), [releaseScroll]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={open}
        aria-label="Open timeline sort"
        aria-haspopup="dialog"
        className="inline-flex h-8 w-8 items-center justify-center border border-border text-text transition-colors hover:border-text-soft hover:bg-surface-muted"
      >
        <ArrowDownUp className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="timeline-sort-title"
        onClose={() => {
          releaseScroll();
          triggerRef.current?.focus();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="m-auto w-[min(24rem,calc(100%-2rem))] overscroll-contain border border-border-strong bg-surface p-0 text-text shadow-(--shadow-dialog) backdrop:bg-black/70"
      >
        <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
          <p id="timeline-sort-title" className="font-mono text-xs uppercase tracking-[0.12em] text-accent">
            Sort timeline
          </p>
          <button
            type="button"
            aria-label="Close timeline sort"
            onClick={close}
            className="inline-flex h-9 w-9 items-center justify-center border border-border text-text-soft transition-colors hover:bg-surface-muted hover:text-text"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>
        <div className="grid grid-cols-2 gap-1 border-b border-border p-2" role="group" aria-label="Sort direction">
          {(["desc", "asc"] as const).map((optionDirection) => (
            <button
              key={optionDirection}
              type="button"
              aria-pressed={direction === optionDirection}
              disabled={direction === optionDirection}
              onClick={() => {
                navigate(hrefWithRunSort(params, selectedSort, optionDirection));
              }}
              className={`h-8 border px-3 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors ${
                direction === optionDirection
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border text-text-soft hover:border-text-soft hover:bg-surface-muted hover:text-text"
              }`}
            >
              {optionDirection === "desc" ? "Descending" : "Ascending"}
            </button>
          ))}
        </div>
        <div className="p-2">
          {RUN_TABLE_SORT_OPTIONS.map((option) => {
            const { active, direction } = getRunSortState(params, option.sort, option.defaultDirection);

            return active ? (
              <span
                key={option.sort}
                aria-current="true"
                className="flex h-10 items-center justify-between border border-accent bg-accent-soft px-3 font-mono text-xs text-accent"
              >
                {option.label}
                <span className="text-[10px] uppercase tracking-[0.08em]">{direction}</span>
              </span>
            ) : (
              <RunDataRefreshLink
                key={option.sort}
                href={hrefWithRunSort(params, option.sort, option.defaultDirection)}
                scroll={false}
                onClick={close}
                className="flex h-10 items-center border border-transparent px-3 font-mono text-xs text-text-soft transition-colors hover:border-border hover:bg-surface-muted hover:text-text"
              >
                {option.label}
              </RunDataRefreshLink>
            );
          })}
        </div>
      </dialog>
    </>
  );
}
