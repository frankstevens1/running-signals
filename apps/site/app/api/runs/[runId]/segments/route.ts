import { getRunSegments } from "@/app/lib/data";
import { jsonResult } from "@/app/lib/api-response";
import { parsePositiveInt } from "@/app/lib/query";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const searchParams = new URL(request.url).searchParams;

  return jsonResult(
    await getRunSegments(runId, parsePositiveInt(searchParams.get("limit"), 1200, 5000)),
  );
}
