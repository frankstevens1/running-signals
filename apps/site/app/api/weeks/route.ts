import { getWeeks } from "@/app/lib/data";
import { jsonResult } from "@/app/lib/api-response";
import { isStrictPositiveInt, parsePositiveInt } from "@/app/lib/query";
import { analyticsWindowFromRequestUrlOnly } from "@/app/lib/analytics-window-server";
import { windowedResult } from "@/app/lib/windowed-result";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function withTruncation<T>(result: { status: "ok"; data: T[] }, limit: number) {
  const truncated = result.data.length > limit;
  return {
    status: "ok" as const,
    data: { items: result.data.slice(0, limit), total: result.data.length, limit, truncated },
  };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (!isStrictPositiveInt(params.get("limit"), 1000)) {
    return NextResponse.json({ error: "limit is invalid." }, { status: 400 });
  }
  const limit = parsePositiveInt(params.get("limit"), 104, 1000);
  const window = analyticsWindowFromRequestUrlOnly(request);
  return jsonResult(await windowedResult(
    window,
    getWeeks(window.primary).then((result) => result.status === "ok"
      ? withTruncation(result, limit) : result),
    window.comparison
      ? getWeeks(window.comparison).then((result) => result.status === "ok"
        ? withTruncation(result, limit) : result)
      : null,
  ));
}
