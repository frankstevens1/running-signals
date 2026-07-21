import { NextResponse } from "next/server";

import type { DataResult } from "./types";

export const PUBLIC_READ_CACHE_CONTROL =
  "public, s-maxage=900, stale-while-revalidate=86400";

export function jsonResult<T>(result: DataResult<T>): NextResponse {
  if (result.status === "ok") {
    return NextResponse.json(result.data, {
      headers: { "Cache-Control": PUBLIC_READ_CACHE_CONTROL },
    });
  }

  return NextResponse.json(
    { error: result.message },
    { status: result.status === "not_configured" ? 503 : 500 },
  );
}
