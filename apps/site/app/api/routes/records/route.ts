import { NextResponse } from "next/server";

import { getRouteRecords } from "@/app/lib/data";
import { jsonResult } from "@/app/lib/api-response";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const routeId = new URL(request.url).searchParams.get("routeId")?.trim();
  if (!routeId) {
    return NextResponse.json({ error: "routeId is required." }, { status: 400 });
  }

  return jsonResult(await getRouteRecords(routeId));
}
