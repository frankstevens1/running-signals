export const ANALYTICS_WINDOW_STORAGE_KEY = "running-signals-analytics-window";

export type AnalyticsWindowPreset =
  | "current-year"
  | "previous-year"
  | "last-4-weeks"
  | "last-12-weeks"
  | "last-52-weeks"
  | "all-time"
  | "custom";

export type AnalyticsComparison =
  | "auto"
  | "previous-period"
  | "previous-year"
  | "none";

export type AnalyticsWindowState = {
  preset: AnalyticsWindowPreset;
  comparison: AnalyticsComparison;
  customFrom?: string;
  customTo?: string;
};

export type DateWindow = { from: string | null; to: string | null };

export type ResolvedAnalyticsWindow = {
  state: AnalyticsWindowState;
  primary: DateWindow;
  comparison: DateWindow | null;
  effectiveComparison: Exclude<AnalyticsComparison, "auto">;
};

const PRESETS = new Set<AnalyticsWindowPreset>([
  "current-year", "previous-year", "last-4-weeks", "last-12-weeks",
  "last-52-weeks", "all-time", "custom",
]);
const COMPARISONS = new Set<AnalyticsComparison>([
  "auto", "previous-period", "previous-year", "none",
]);
const DAY_MS = 86_400_000;

export const DEFAULT_ANALYTICS_WINDOW_STATE: AnalyticsWindowState = {
  preset: "current-year",
  comparison: "auto",
};

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateFromIso(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = dateFromIso(value);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

function shiftYear(value: string, years: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const targetYear = year + years;
  const lastDay = new Date(Date.UTC(targetYear, month, 0)).getUTCDate();
  return `${targetYear}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

export function amsterdamToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeState(value: unknown): AnalyticsWindowState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (!PRESETS.has(candidate.preset as AnalyticsWindowPreset)) return null;
  const comparison = COMPARISONS.has(candidate.comparison as AnalyticsComparison)
    ? (candidate.comparison as AnalyticsComparison)
    : "auto";
  const preset = candidate.preset as AnalyticsWindowPreset;

  if (preset === "custom") {
    if (!isIsoDate(candidate.customFrom) || !isIsoDate(candidate.customTo)) return null;
    if (candidate.customFrom > candidate.customTo) return null;
    return { preset, comparison, customFrom: candidate.customFrom, customTo: candidate.customTo };
  }
  return { preset, comparison };
}

export function parseAnalyticsWindowState(raw: string | null): AnalyticsWindowState | null {
  if (!raw) return null;
  try {
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      // The value may already be decoded by the cookie implementation.
    }
    return normalizeState(JSON.parse(decoded));
  } catch {
    return null;
  }
}

export function serializeAnalyticsWindowState(state: AnalyticsWindowState): string {
  return JSON.stringify(state);
}

export function analyticsWindowStateFromUrl(params: URLSearchParams): AnalyticsWindowState | null {
  const preset = params.get("window");
  if (!preset) return null;
  if (!PRESETS.has(preset as AnalyticsWindowPreset)) return null;
  return normalizeState({
    preset,
    comparison: params.get("comparison") ?? "auto",
    customFrom: params.get("windowFrom") ?? undefined,
    customTo: params.get("windowTo") ?? undefined,
  });
}

export function isMalformedAnalyticsUrlState(params: URLSearchParams): boolean {
  const preset = params.get("window");
  if (!preset) return false;
  return analyticsWindowStateFromUrl(params) === null;
}

export function withAnalyticsWindowState(
  params: URLSearchParams,
  state: AnalyticsWindowState,
): URLSearchParams {
  const next = new URLSearchParams(params);
  next.set("window", state.preset);
  next.set("comparison", state.comparison);
  if (state.preset === "custom") {
    next.set("windowFrom", state.customFrom ?? "");
    next.set("windowTo", state.customTo ?? "");
  } else {
    next.delete("windowFrom");
    next.delete("windowTo");
  }
  next.delete("offset");
  next.delete("routeOffset");
  return next;
}

function primaryWindow(state: AnalyticsWindowState, today: string): DateWindow {
  const year = Number(today.slice(0, 4));
  switch (state.preset) {
    case "current-year": return { from: `${year}-01-01`, to: today };
    case "previous-year": return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
    case "last-4-weeks": return { from: addDays(today, -27), to: today };
    case "last-12-weeks": return { from: addDays(today, -83), to: today };
    case "last-52-weeks": return { from: addDays(today, -363), to: today };
    case "all-time": return { from: null, to: null };
    case "custom": return { from: state.customFrom ?? null, to: state.customTo ?? null };
  }
}

function comparisonWindow(primary: DateWindow, mode: Exclude<AnalyticsComparison, "auto">) {
  if (mode === "none" || primary.from === null || primary.to === null) return null;
  if (mode === "previous-year") {
    return { from: shiftYear(primary.from, -1), to: shiftYear(primary.to, -1) };
  }
  const durationDays = Math.round(
    (dateFromIso(primary.to).getTime() - dateFromIso(primary.from).getTime()) / DAY_MS,
  ) + 1;
  return { from: addDays(primary.from, -durationDays), to: addDays(primary.from, -1) };
}

export function resolveAnalyticsWindow(
  params: URLSearchParams,
  cookieValue: string | null,
  today = amsterdamToday(),
): ResolvedAnalyticsWindow {
  const state = analyticsWindowStateFromUrl(params)
    ?? parseAnalyticsWindowState(cookieValue)
    ?? DEFAULT_ANALYTICS_WINDOW_STATE;
  const primary = primaryWindow(state, today);
  const effectiveComparison = state.comparison === "auto"
    ? state.preset === "current-year" || state.preset === "previous-year"
      ? "previous-year"
      : state.preset === "all-time" ? "none" : "previous-period"
    : state.comparison;
  return {
    state,
    primary,
    comparison: comparisonWindow(primary, effectiveComparison),
    effectiveComparison,
  };
}
