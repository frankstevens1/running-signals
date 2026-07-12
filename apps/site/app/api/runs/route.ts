import { NextResponse } from "next/server";

import { jsonResult } from "@/app/lib/api-response";
import { getRuns } from "@/app/lib/data";
import { isDistanceUnit } from "@/app/lib/distance-unit";
import { parseRunFilters } from "@/app/lib/query";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const requestedUnit = params.get("unit");
  if (requestedUnit !== null && !isDistanceUnit(requestedUnit)) {
    return NextResponse.json({ error: "unit must be km or mi." }, { status: 400 });
  }

  return jsonResult(await getRuns(parseRunFilters(params, requestedUnit ?? "km")));
}
