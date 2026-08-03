import { NextResponse } from "next/server";

import { SQLEARN_SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SQLEARN_SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return response;
}
