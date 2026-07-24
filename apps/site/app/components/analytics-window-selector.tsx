"use client";

import { CalendarRange } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  ANALYTICS_WINDOW_STORAGE_KEY,
  analyticsWindowStateFromUrl,
  DEFAULT_ANALYTICS_WINDOW_STATE,
  parseAnalyticsWindowState,
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

const controlClass =
  "h-9 border border-(--border) bg-(--background) px-2 font-mono text-[10px] text-(--text) outline-none focus:border-(--accent) rounded-none";

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
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (detailsRef.current && !detailsRef.current.contains(event.target as Node)) {
        detailsRef.current.open = false;
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

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
    if (detailsRef.current) detailsRef.current.open = false;
    const next = withAnalyticsWindowState(new URLSearchParams(paramsString), state);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <details ref={detailsRef} className="group relative">
      <summary className="flex h-9 cursor-pointer list-none items-center gap-2 border border-(--border) bg-(--surface) px-2.5 font-mono text-[10px] uppercase tracking-[0.06em] text-(--text-soft) hover:border-(--accent) hover:text-(--text)">
        <CalendarRange className="size-3.5 text-(--accent)" aria-hidden="true" />
        <span className="hidden lg:inline">{presetLabels[state.preset]}</span>
        <span className="sr-only">Select analytics window</span>
      </summary>
      <form
        onSubmit={apply}
        className="absolute right-0 top-11 z-50 w-[min(23rem,calc(100vw-2rem))] space-y-3 border border-(--border) bg-(--surface) p-3 shadow-2xl"
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-(--accent)">
          analytics.window
        </p>
        <label className="block space-y-1">
          <span className="font-mono text-[9px] uppercase text-(--text-soft)">Period</span>
          <select
            value={state.preset}
            onChange={(event) => update("preset", event.target.value as AnalyticsWindowPreset)}
            className={`${controlClass} w-full`}
          >
            {Object.entries(presetLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        {state.preset === "custom" ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="font-mono text-[9px] uppercase text-(--text-soft)">From</span>
              <input
                type="date"
                required
                value={state.customFrom ?? ""}
                max={state.customTo}
                onChange={(event) => update("customFrom", event.target.value)}
                className={`${controlClass} w-full`}
              />
            </label>
            <label className="space-y-1">
              <span className="font-mono text-[9px] uppercase text-(--text-soft)">To</span>
              <input
                type="date"
                required
                value={state.customTo ?? ""}
                min={state.customFrom}
                onChange={(event) => update("customTo", event.target.value)}
                className={`${controlClass} w-full`}
              />
            </label>
          </div>
        ) : null}
        <label className="block space-y-1">
          <span className="font-mono text-[9px] uppercase text-(--text-soft)">Compare</span>
          <select
            value={state.comparison}
            onChange={(event) => update("comparison", event.target.value as AnalyticsComparison)}
            className={`${controlClass} w-full`}
          >
            <option value="auto">Auto</option>
            <option value="previous-period">Previous period</option>
            <option value="previous-year">Previous year</option>
            <option value="none">None</option>
          </select>
        </label>
        <button
          type="submit"
          className="h-9 w-full bg-(--accent) px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-(--accent-foreground) hover:bg-(--accent-strong)"
        >
          Apply window
        </button>
        <p className="font-mono text-[9px] leading-4 text-(--text-soft)">
          Calendar boundaries use Europe/Amsterdam.
        </p>
      </form>
    </details>
  );
}
