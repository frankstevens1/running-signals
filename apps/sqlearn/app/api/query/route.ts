import { NextRequest, NextResponse } from "next/server";
import { executeQuery } from "@/lib/sql-runner";
import type { Engine } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { sql: string; engine?: string };
    const { sql, engine = "supabase" } = body;

    if (!sql || typeof sql !== "string") {
      return NextResponse.json({ error: "Missing or invalid 'sql' field." }, { status: 400 });
    }

    const validEngines = ["supabase", "databricks"];
    if (!validEngines.includes(engine)) {
      return NextResponse.json(
        { error: `Invalid engine. Must be one of: ${validEngines.join(", ")}.` },
        { status: 400 }
      );
    }

    const result = await executeQuery(sql, engine as Engine);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unknown error occurred.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
