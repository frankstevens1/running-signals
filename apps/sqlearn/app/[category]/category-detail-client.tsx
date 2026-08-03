"use client";

import ExerciseCard from "@/components/exercise-card";
import type { ExerciseFile, SolutionFile } from "@/lib/types";

interface ExerciseWithData extends ExerciseFile {
  prompt: string;
  solutions: SolutionFile[];
}

interface CategoryDetailClientProps {
  categoryId: string;
  exercises: ExerciseWithData[];
}

export default function CategoryDetailClient({ categoryId, exercises }: CategoryDetailClientProps) {
  if (exercises.length === 0) {
    return (
      <p className="text-text-faint text-sm">
        No exercises yet. Add <code className="text-accent">.sql</code> files to{" "}
        <code className="text-accent">curriculum/{categoryId}/exercises/</code>.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {exercises.map((ex) => (
        <ExerciseCard
          key={ex.id}
          categoryId={categoryId}
            exercise={ex}
            prompt={ex.prompt}
            solutions={ex.solutions}
          />
      ))}
    </div>
  );
}
