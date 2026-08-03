import { NextRequest, NextResponse } from "next/server";
import { hasValidSession, SQLEARN_SESSION_COOKIE } from "@/lib/auth";
import {
  getExerciseContent,
  getSolutionContent,
} from "@/lib/curriculum";

export async function GET(request: NextRequest) {
  if (!await hasValidSession(request.cookies.get(SQLEARN_SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const exercise = searchParams.get("exercise");
  const solution = searchParams.get("solution");

  if (category && exercise && solution) {
    const content = getSolutionContent(category, exercise, solution);
    if (!content) {
      return NextResponse.json({ error: "Solution not found." }, { status: 404 });
    }
    return NextResponse.json({ content });
  }

  if (category && exercise) {
    const content = getExerciseContent(category, exercise);
    if (!content) {
      return NextResponse.json({ error: "Exercise not found." }, { status: 404 });
    }
    return NextResponse.json({ content });
  }

  return NextResponse.json({ error: "Missing parameters." }, { status: 400 });
}
