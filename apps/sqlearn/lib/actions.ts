"use server";

import { saveSolution } from "@/lib/curriculum";

export async function saveUserSolution(
  categoryId: string,
  exerciseId: string,
  label: string,
  content: string
) {
  "use server";
  const result = saveSolution(categoryId, exerciseId, label, content);
  return result;
}
