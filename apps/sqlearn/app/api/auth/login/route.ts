import { NextRequest, NextResponse } from "next/server";

import { createSessionToken, sessionCookieOptions, SQLEARN_SESSION_COOKIE } from "@/lib/auth";
import { verifySqlearnPassword } from "@/lib/password";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

function safeReturnTo(value: unknown) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/";
}

export async function POST(request: NextRequest) {
  let rateLimitResponse: NextResponse | null;
  try {
    rateLimitResponse = await enforceRateLimit(request, "login");
  } catch {
    return NextResponse.json({ error: "Authentication is temporarily unavailable." }, { status: 503 });
  }
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = (await request.json()) as { password?: unknown; returnTo?: unknown };
    if (typeof body.password !== "string" || body.password.length === 0 || body.password.length > 1024) {
      return NextResponse.json({ error: "Invalid password." }, { status: 400 });
    }

    if (!await verifySqlearnPassword(body.password)) {
      return NextResponse.json({ error: "Invalid password." }, { status: 401 });
    }

    const response = NextResponse.json({ returnTo: safeReturnTo(body.returnTo) });
    response.cookies.set(SQLEARN_SESSION_COOKIE, await createSessionToken(), sessionCookieOptions);
    return response;
  } catch {
    return NextResponse.json({ error: "Authentication is temporarily unavailable." }, { status: 503 });
  }
}
