import { getDays } from "@/app/lib/data";
import { jsonResult } from "@/app/lib/api-response";
import { parsePositiveInt } from "@/app/lib/query";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return jsonResult(await getDays(parsePositiveInt(params.get("limit"), 371, 1200)));
}
