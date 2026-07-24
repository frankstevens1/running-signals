import { NextResponse } from "next/server";

import { jsonResult } from "@/app/lib/api-response";
import { getRuns } from "@/app/lib/data";
import { isDistanceUnit } from "@/app/lib/distance-unit";
import { parseRunFilters } from "@/app/lib/query";
import { isStrictOffset, isStrictPositiveInt, parseOptionalDate } from "@/app/lib/query";
import { analyticsWindowFromRequestUrlOnly } from "@/app/lib/analytics-window-server";
import { windowedResult } from "@/app/lib/windowed-result";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const requestedUnit = params.get("unit");
  if (requestedUnit !== null && !isDistanceUnit(requestedUnit)) {
    return NextResponse.json({ error: "unit must be km or mi." }, { status: 400 });
  }
  if (!isStrictPositiveInt(params.get("limit"), 100) || !isStrictOffset(params.get("offset"))) {
    return NextResponse.json({ error: "limit or offset is invalid." }, { status: 400 });
  }
  for (const key of ["dateFrom", "dateTo"] as const) {
    if (params.has(key) && parseOptionalDate(params.get(key)) === undefined) {
      return NextResponse.json({ error: `${key} must be a valid YYYY-MM-DD date.` }, { status: 400 });
    }
  }

  const window = analyticsWindowFromRequestUrlOnly(request);
  const filters = parseRunFilters(params, requestedUnit ?? "km");
  const comparisonFilters = { ...filters, dateFrom: undefined, dateTo: undefined };
  return jsonResult(await windowedResult(
    window,
    getRuns(filters, window.primary),
    window.comparison ? getRuns(comparisonFilters, window.comparison) : null,
  ));
}
