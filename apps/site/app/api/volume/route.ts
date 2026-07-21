import { getVolume } from "@/app/lib/data";
import { jsonResult } from "@/app/lib/api-response";

export const runtime = "nodejs";

export async function GET() {
  return jsonResult(await getVolume());
}
