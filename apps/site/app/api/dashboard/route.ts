import { getDashboardSummary } from "@/app/lib/data";
import { analyticsWindowFromRequestUrlOnly } from "@/app/lib/analytics-window-server";
import { windowedResult } from "@/app/lib/windowed-result";
import { jsonResult } from "@/app/lib/api-response";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const window = analyticsWindowFromRequestUrlOnly(request);
  return jsonResult(await windowedResult(
    window,
    getDashboardSummary(window.primary),
    window.comparison ? getDashboardSummary(window.comparison) : null,
  ));
}
