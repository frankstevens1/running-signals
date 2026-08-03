import { NextRequest, NextResponse } from "next/server";

import { hasValidSession, SQLEARN_SESSION_COOKIE } from "@/lib/auth";

const publicPaths = new Set(["/unlock", "/api/auth/login", "/api/auth/logout"]);

export async function proxy(request: NextRequest) {
  if (publicPaths.has(request.nextUrl.pathname)) return NextResponse.next();

  const token = request.cookies.get(SQLEARN_SESSION_COOKIE)?.value;
  if (await hasValidSession(token)) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const url = new URL("/unlock", request.url);
  url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
