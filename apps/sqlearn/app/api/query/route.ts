import { NextRequest, NextResponse } from "next/server";
import { hasValidSession, SQLEARN_SESSION_COOKIE } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { executeQuery } from "@/lib/sql-runner";

export async function POST(request: NextRequest) {
  if (!await hasValidSession(request.cookies.get(SQLEARN_SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 12_000) {
    return NextResponse.json({ error: "Query payload is too large." }, { status: 413 });
  }

  let rateLimitResponse: NextResponse | null;
  try {
    rateLimitResponse = await enforceRateLimit(request, "query");
  } catch {
    return NextResponse.json({ error: "Query execution is temporarily unavailable." }, { status: 503 });
  }
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = (await request.json()) as { sql?: unknown };
    const { sql } = body;

    if (!sql || typeof sql !== "string") {
      return NextResponse.json({ error: "Missing or invalid 'sql' field." }, { status: 400 });
    }

    const result = await executeQuery(sql);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query execution failed.";
    const isValidationError = message.includes("allowed")
      || message.includes("LIMIT")
      || message.includes("statement")
      || message.includes("parsed")
      || message.includes("characters");
    return NextResponse.json({ error: isValidationError ? message : "Query execution failed." }, {
      status: isValidationError ? 400 : 500,
    });
  }
}
