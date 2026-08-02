import { NextRequest, NextResponse } from "next/server";
import {
  getExerciseContent,
  getSolutionContent,
  saveSolution,
} from "@/lib/curriculum";

export async function GET(request: NextRequest) {
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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      categoryId: string;
      exerciseId: string;
      label: string;
      content: string;
    };

    if (!body.categoryId || !body.exerciseId || !body.label || !body.content) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const result = saveSolution(body.categoryId, body.exerciseId, body.label, body.content);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
