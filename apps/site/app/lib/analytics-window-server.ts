import "server-only";

import { cookies } from "next/headers";

import { ANALYTICS_WINDOW_STORAGE_KEY, resolveAnalyticsWindow } from "./analytics-window";
import { searchParamsFromRecord } from "./query";

export async function getServerAnalyticsWindow(
  searchParams: Record<string, string | string[] | undefined>,
) {
  const cookieStore = await cookies();
  return resolveAnalyticsWindow(
    searchParamsFromRecord(searchParams),
    cookieStore.get(ANALYTICS_WINDOW_STORAGE_KEY)?.value ?? null,
  );
}

export function analyticsWindowFromRequest(request: Request) {
  const url = new URL(request.url);
  const cookie = request.headers.get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${ANALYTICS_WINDOW_STORAGE_KEY}=`))
    ?.slice(ANALYTICS_WINDOW_STORAGE_KEY.length + 1) ?? null;
  return resolveAnalyticsWindow(url.searchParams, cookie);
}

export function analyticsWindowFromRequestUrlOnly(request: Request) {
  return resolveAnalyticsWindow(new URL(request.url).searchParams, null);
}
