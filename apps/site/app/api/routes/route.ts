import { getRoutes } from "@/app/lib/data";
import { jsonResult } from "@/app/lib/api-response";
import { isStrictOffset, isStrictPositiveInt, parseOffset, parsePositiveInt } from "@/app/lib/query";
import { analyticsWindowFromRequestUrlOnly } from "@/app/lib/analytics-window-server";
import { NextResponse } from "next/server";
import { windowedResult } from "@/app/lib/windowed-result";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (!isStrictPositiveInt(params.get("routeLimit"), 100) || !isStrictOffset(params.get("routeOffset"))) {
    return NextResponse.json({ error: "routeLimit or routeOffset is invalid." }, { status: 400 });
  }
  const limit = parsePositiveInt(params.get("routeLimit"), 25, 100);
  const offset = parseOffset(params.get("routeOffset"), 0, 100_000);
  const window = analyticsWindowFromRequestUrlOnly(request);
  const paginate = (promise: ReturnType<typeof getRoutes>) => promise.then((result) =>
    result.status === "ok"
      ? {
          status: "ok" as const,
          data: {
            items: result.data.slice(offset, offset + limit),
            total: result.data.length,
            limit,
            offset,
          },
        }
      : result,
  );
  return jsonResult(await windowedResult(
    window,
    paginate(getRoutes(window.primary)),
    window.comparison ? paginate(getRoutes(window.comparison)) : null,
  ));
}
