import { NextRequest, NextResponse } from "next/server";
import { codeToHtml } from "shiki";
import { hasValidSession, SQLEARN_SESSION_COOKIE } from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!await hasValidSession(request.cookies.get(SQLEARN_SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { sql: string };

    if (!body.sql || typeof body.sql !== "string" || body.sql.length > 64_000) {
      return NextResponse.json({ error: "Missing SQL." }, { status: 400 });
    }

    const html = await codeToHtml(body.sql, {
      lang: "sql",
      theme: "dark-plus",
    });

    return NextResponse.json({ html });
  } catch {
    return NextResponse.json({ error: "Unable to highlight SQL." }, { status: 500 });
  }
}
