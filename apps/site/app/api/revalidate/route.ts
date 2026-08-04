import { timingSafeEqual } from "node:crypto";

import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { SITE_DATA_CACHE_TAG } from "@/app/lib/site-data-cache";

export const runtime = "nodejs";

function noStoreJson(body: Record<string, boolean>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function hasValidSecret(value: string | null, expected: string): boolean {
  const token = value?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return false;

  const supplied = Buffer.from(token);
  const configured = Buffer.from(expected);
  return supplied.length === configured.length && timingSafeEqual(supplied, configured);
}

export async function POST(request: Request) {
  const secret = process.env.SITE_REVALIDATE_SECRET;
  if (!secret) return noStoreJson({ ok: false }, 500);

  if (!hasValidSecret(request.headers.get("authorization"), secret)) {
    return noStoreJson({ ok: false }, 401);
  }

  revalidateTag(SITE_DATA_CACHE_TAG, { expire: 0 });
  return noStoreJson({ ok: true }, 200);
}
