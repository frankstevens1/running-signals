import { NextResponse } from "next/server";

import { jsonResult } from "@/app/lib/api-response";
import { getRunSegments } from "@/app/lib/data";
import {
  isDistanceUnit,
  parseSegmentResolution,
  unitSystemFor,
} from "@/app/lib/distance-unit";
import { isStrictPositiveInt, parsePositiveInt } from "@/app/lib/query";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const searchParams = new URL(request.url).searchParams;
  const requestedUnit = searchParams.get("unit") ?? "km";
  const requestedResolution = searchParams.get("resolution") ?? "1";

  if (!isDistanceUnit(requestedUnit)) {
    return NextResponse.json({ error: "unit must be km or mi." }, { status: 400 });
  }

  const resolution = parseSegmentResolution(requestedResolution);
  if (resolution === null) {
    return NextResponse.json(
      { error: "resolution must be 0.25, 0.5, or 1." },
      { status: 400 },
    );
  }
  if (!isStrictPositiveInt(searchParams.get("limit"), 5000)) {
    return NextResponse.json({ error: "limit is invalid." }, { status: 400 });
  }

  return jsonResult(
    await getRunSegments(
      runId,
      unitSystemFor(requestedUnit),
      resolution,
      parsePositiveInt(searchParams.get("limit"), 1200, 5000),
    ),
  );
}
