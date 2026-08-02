import { NextRequest, NextResponse } from "next/server";
import { codeToHtml } from "shiki";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { sql: string };

    if (!body.sql || typeof body.sql !== "string") {
      return NextResponse.json({ error: "Missing SQL." }, { status: 400 });
    }

    const html = await codeToHtml(body.sql, {
      lang: "sql",
      theme: "dark-plus",
    });

    return NextResponse.json({ html });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
