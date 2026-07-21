import "server-only";

type SupabaseConfig = {
  url: string;
  anonKey: string;
};

type SupabaseScalar = string | number | boolean | null;

export type SupabaseFilter =
  | {
      column: string;
      operator: "eq" | "gte" | "lte" | "is" | "not.is";
      value: SupabaseScalar;
    }
  | {
      column: string;
      operator: "in";
      value: readonly (string | number)[];
    };

export type SupabaseOrder = {
  column: string;
  direction: "asc" | "desc";
  nulls?: "first" | "last";
};

export type SupabaseQueryOptions = {
  select?: string;
  filters?: SupabaseFilter[];
  order?: SupabaseOrder[];
  limit?: number;
  offset?: number;
  count?: "exact";
};

export type SupabaseQueryResult = {
  rows: Record<string, unknown>[];
  count: number | null;
};

const NOT_CONFIGURED_MESSAGE =
  "Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.";
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IjEyNy4wLjAuMSIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNjQxNzY5MjAwLCJleHAiOjE5NTczNDU2MDB9.PnClt_KbNAZBeig826Dz3nQwRV71mAb9b3wOqXfHh8o";

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super(NOT_CONFIGURED_MESSAGE);
  }
}

function getConfig(): SupabaseConfig {
  const useLocalDefaults = process.env.NODE_ENV !== "production";
  const url = process.env.SUPABASE_URL ?? (useLocalDefaults ? LOCAL_SUPABASE_URL : undefined);
  const anonKey =
    process.env.SUPABASE_ANON_KEY ?? (useLocalDefaults ? LOCAL_SUPABASE_ANON_KEY : undefined);

  if (!url || !anonKey) {
    throw new SupabaseNotConfiguredError();
  }

  return {
    url: url.replace(/\/$/, ""),
    anonKey,
  };
}

function getRevalidateSeconds(): number {
  const configured = Number(process.env.SITE_DATA_REVALIDATE_SECONDS ?? "900");

  if (!Number.isFinite(configured) || configured < 0) {
    return 900;
  }

  return Math.floor(configured);
}

function fetchCacheOptions():
  | { cache: "no-store" }
  | { next: { revalidate: number } } {
  const revalidate = getRevalidateSeconds();

  if (revalidate === 0) {
    return { cache: "no-store" };
  }

  return { next: { revalidate } };
}

function supabaseValue(value: SupabaseScalar): string {
  if (value === null) return "null";
  return String(value);
}

function postgrestQuotedValue(value: string | number): string {
  const escaped = String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `"${escaped}"`;
}

function supabaseFilterValue(filter: SupabaseFilter): string {
  if (filter.operator !== "in") return supabaseValue(filter.value);
  return `(${filter.value.map(postgrestQuotedValue).join(",")})`;
}

function parseCount(value: string | null): number | null {
  if (!value) return null;

  const [, total] = value.split("/");
  const parsed = Number(total);

  return Number.isFinite(parsed) ? parsed : null;
}

export async function querySupabase(
  table: string,
  options: SupabaseQueryOptions = {},
): Promise<SupabaseQueryResult> {
  const config = getConfig();
  const url = new URL(`${config.url}/rest/v1/${table}`);
  const headers: Record<string, string> = {
    apikey: config.anonKey,
    Authorization: `Bearer ${config.anonKey}`,
  };

  if (options.count === "exact") {
    headers.Prefer = "count=exact";
  }

  url.searchParams.set("select", options.select ?? "*");

  for (const filter of options.filters ?? []) {
    url.searchParams.append(
      filter.column,
      `${filter.operator}.${supabaseFilterValue(filter)}`,
    );
  }

  if (options.order?.length) {
    url.searchParams.set(
      "order",
      options.order
        .map((item) => {
          const nulls = item.nulls ? `.nulls${item.nulls}` : "";
          return `${item.column}.${item.direction}${nulls}`;
        })
        .join(","),
    );
  }

  if (options.limit !== undefined) {
    url.searchParams.set("limit", String(options.limit));
  }

  if (options.offset !== undefined) {
    url.searchParams.set("offset", String(options.offset));
  }

  const response = await fetch(url, {
    headers,
    ...fetchCacheOptions(),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Supabase request failed with HTTP ${response.status}: ${message}`,
    );
  }

  return {
    rows: (await response.json()) as Record<string, unknown>[],
    count: parseCount(response.headers.get("content-range")),
  };
}

export function isSupabaseNotConfigured(error: unknown): boolean {
  return error instanceof SupabaseNotConfiguredError;
}
