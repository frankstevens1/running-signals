import { getRunRecords } from "@/app/lib/data";
import { jsonResult } from "@/app/lib/api-response";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  return jsonResult(await getRunRecords(runId));
}
