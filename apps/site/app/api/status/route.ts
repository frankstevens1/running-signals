import { jsonResult } from "@/app/lib/api-response";
import { getLandingStatus } from "@/app/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const response = jsonResult(await getLandingStatus());
  response.headers.set("Cache-Control", "no-store");
  return response;
}
