import { NextResponse } from "next/server";

import type { DataResult } from "./types";

export function jsonResult<T>(result: DataResult<T>): NextResponse {
  if (result.status === "ok") {
    return NextResponse.json(result.data);
  }

  return NextResponse.json(
    { error: result.message },
    { status: result.status === "not_configured" ? 503 : 500 },
  );
}
