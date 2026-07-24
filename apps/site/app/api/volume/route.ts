import { getVolume } from "@/app/lib/data";
import { jsonResult } from "@/app/lib/api-response";
import { analyticsWindowFromRequestUrlOnly } from "@/app/lib/analytics-window-server";
import { windowedResult } from "@/app/lib/windowed-result";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const window = analyticsWindowFromRequestUrlOnly(request);
  return jsonResult(await windowedResult(
    window,
    getVolume(window.primary),
    window.comparison ? getVolume(window.comparison) : null,
  ));
}
