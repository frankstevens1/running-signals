"use client";

import { CalendarRange, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  ANALYTICS_WINDOW_STORAGE_KEY,
  analyticsWindowStateFromUrl,
  amsterdamToday,
  DEFAULT_ANALYTICS_WINDOW_STATE,
  parseAnalyticsWindowState,
  resolveAnalyticsWindow,
  serializeAnalyticsWindowState,
  withAnalyticsWindowState,
  type AnalyticsComparison,
  type AnalyticsWindowPreset,
  type AnalyticsWindowState,
} from "@/app/lib/analytics-window";

const presetLabels: Record<AnalyticsWindowPreset, string> = {
  "current-year": "Current year",
  "previous-year": "Previous year",
  "last-4-weeks": "Last 4 weeks",
  "last-12-weeks": "Last 12 weeks",
  "last-52-weeks": "Last 52 weeks",
  "all-time": "All time",
  custom: "Custom",
};

function cookieState(): AnalyticsWindowState | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie.split("; ")
    .find((row) => row.startsWith(`${ANALYTICS_WINDOW_STORAGE_KEY}=`))
    ?.slice(ANALYTICS_WINDOW_STORAGE_KEY.length + 1) ?? null;
  return parseAnalyticsWindowState(raw);
}

function persist(state: AnalyticsWindowState) {
  const serialized = serializeAnalyticsWindowState(state);
  window.localStorage.setItem(ANALYTICS_WINDOW_STORAGE_KEY, serialized);
  document.cookie = `${ANALYTICS_WINDOW_STORAGE_KEY}=${encodeURIComponent(serialized)}; path=/; max-age=31536000; samesite=lax`;
}

export function AnalyticsWindowSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const paramsString = searchParams.toString();
  const urlState = analyticsWindowStateFromUrl(new URLSearchParams(paramsString));
  const [state, setState] = useState<AnalyticsWindowState>(
    urlState ?? cookieState() ?? DEFAULT_ANALYTICS_WINDOW_STATE,
  );
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    document.body.style.overflow = "hidden";

    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), select, input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );

      if (!focusableElements || focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement?.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement?.focus();
      }
    }

    document.addEventListener("keydown", handleDialogKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleDialogKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    const currentUrlState = analyticsWindowStateFromUrl(new URLSearchParams(paramsString));
    let storedState: AnalyticsWindowState | null = null;
    try {
      storedState = parseAnalyticsWindowState(
        window.localStorage.getItem(ANALYTICS_WINDOW_STORAGE_KEY),
      );
    } catch {
      // Cookie and URL state still work when storage is unavailable.
    }
    const selected = currentUrlState ?? cookieState() ?? storedState ?? DEFAULT_ANALYTICS_WINDOW_STATE;
    const stateTimer = window.setTimeout(() => setState(selected), 0);
    try {
      persist(selected);
    } catch {
      // Persistence is an enhancement; navigation still applies the selection.
    }

    if (!currentUrlState && storedState && !cookieState()) {
      const next = withAnalyticsWindowState(new URLSearchParams(paramsString), selected);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }
    return () => window.clearTimeout(stateTimer);
  }, [paramsString, pathname, router]);

  function update<K extends keyof AnalyticsWindowState>(key: K, value: AnalyticsWindowState[K]) {
    setState((current) => ({ ...current, [key]: value }));
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.preset === "custom" && (!state.customFrom || !state.customTo)) return;
    try {
      persist(state);
    } catch {
      // The URL remains authoritative if persistence is blocked.
    }
    setIsOpen(false);
    const next = withAnalyticsWindowState(new URLSearchParams(paramsString), state);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }

  const resolvedWindow = useMemo(() => {
    const today = amsterdamToday();
    const selectedParams = withAnalyticsWindowState(new URLSearchParams(paramsString), state);
    return resolveAnalyticsWindow(selectedParams, null, today);
  }, [paramsString, state]);

  const fmtDate = (d: string | null) => d ?? "\u2014";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className="flex h-9 cursor-pointer list-none items-center gap-2 border border-border bg-surface px-2.5 font-mono text-[10px] uppercase tracking-[0.06em] text-text-soft hover:border-accent hover:text-text"
        onClick={() => setIsOpen(true)}
      >
        <CalendarRange className="size-3.5 text-accent" aria-hidden="true" />
        <span className="hidden text-[8px] lg:inline">{presetLabels[state.preset]}</span>
        <span className="sr-only">Select analytics window</span>
      </button>

      {isOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm"
              onClick={(event) => {
                if (event.target === event.currentTarget) setIsOpen(false);
              }}
            >
              <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-label="Analytics window selector"
                tabIndex={-1}
                className="max-h-[calc(100dvh-3rem)] w-full max-w-sm overflow-y-auto border border-border bg-surface text-text shadow-(--shadow-dialog) outline-none"
              >
                <div className="flex items-start justify-between gap-4 border-b border-border bg-surface-muted px-5 py-4">
                  <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-accent">
                    analytics.window
                  </p>
                  <button
                    ref={closeButtonRef}
                    type="button"
                    aria-label="Close analytics window selector"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-border text-text-soft transition-colors hover:border-accent hover:bg-surface hover:text-text"
                    onClick={() => setIsOpen(false)}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <form onSubmit={apply} className="space-y-4 p-5">
                  <label className="block space-y-1.5">
                    <span className="font-mono text-[10px] uppercase text-text-soft">Period</span>
                    <select
                      value={state.preset}
                      onChange={(event) => update("preset", event.target.value as AnalyticsWindowPreset)}
                      className="h-11 w-full border border-border bg-background px-2 font-mono text-xs text-text outline-none focus:border-accent rounded-none"
                    >
                      {Object.entries(presetLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>

                  {state.preset === "custom" ? (
                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-1.5">
                        <span className="font-mono text-[10px] uppercase text-text-soft">From</span>
                        <input
                          type="date"
                          required
                          value={state.customFrom ?? ""}
                          max={state.customTo}
                          onChange={(event) => update("customFrom", event.target.value)}
                          className="h-11 w-full border border-border bg-background px-2 font-mono text-xs text-text outline-none focus:border-accent rounded-none"
                        />
                      </label>
                      <label className="space-y-1.5">
                        <span className="font-mono text-[10px] uppercase text-text-soft">To</span>
                        <input
                          type="date"
                          required
                          value={state.customTo ?? ""}
                          min={state.customFrom}
                          onChange={(event) => update("customTo", event.target.value)}
                          className="h-11 w-full border border-border bg-background px-2 font-mono text-xs text-text outline-none focus:border-accent rounded-none"
                        />
                      </label>
                    </div>
                  ) : null}

                  <label className="block space-y-1.5">
                    <span className="font-mono text-[10px] uppercase text-text-soft">Compare</span>
                    <select
                      value={state.comparison}
                      onChange={(event) => update("comparison", event.target.value as AnalyticsComparison)}
                      className="h-11 w-full border border-border bg-background px-2 font-mono text-xs text-text outline-none focus:border-accent rounded-none"
                    >
                      <option value="auto">Auto</option>
                      <option value="previous-period">Previous period</option>
                      <option value="previous-year">Previous year</option>
                      <option value="none">None</option>
                    </select>
                  </label>

                  <button
                    type="submit"
                    className="h-11 w-full bg-accent px-3 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-accent-foreground hover:bg-accent-strong"
                  >
                    Apply window
                  </button>

                  <div className="space-y-0.5 border border-border bg-surface-muted px-3 py-2 font-mono text-[10px] leading-4 text-text-soft">
                    <p>Primary : {fmtDate(resolvedWindow.primary.from)} – {fmtDate(resolvedWindow.primary.to)}</p>
                    {resolvedWindow.comparison ? (
                      <p>Compare : {fmtDate(resolvedWindow.comparison.from)} – {fmtDate(resolvedWindow.comparison.to)}</p>
                    ) : (
                      <p>Compare : none</p>
                    )}
                  </div>

                  <p className="font-mono text-[10px] leading-4 text-text-soft">
                    Calendar boundaries use Europe/Amsterdam.
                  </p>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
