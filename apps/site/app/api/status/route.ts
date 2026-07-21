import { jsonResult } from "@/app/lib/api-response";
import { getLandingStatus } from "@/app/lib/data";

export const runtime = "nodejs";

export async function GET() {
  return jsonResult(await getLandingStatus());
}
