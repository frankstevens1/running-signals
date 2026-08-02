"use client";

import { useProgress } from "@/lib/use-progress";
import { type CategoryMeta } from "@/lib/types";
import Link from "next/link";

interface CategoryCardClientProps {
  category: CategoryMeta;
  totalExercises: number;
}

export default function CategoryCardClient({
  category,
  totalExercises,
}: CategoryCardClientProps) {
  const { categoryProgress } = useProgress();
  const done = categoryProgress(category.id, totalExercises);
  const progressPct =
    totalExercises > 0 ? Math.round((done / totalExercises) * 100) : 0;

  return (
    <Link
      href={`/${category.id}`}
      className="block p-5 border border-border bg-surface hover:border-accent/50 hover:bg-surface-raised transition-all group"
    >
      <div className="flex items-start justify-between mb-2">
        <h2 className="font-medium text-text group-hover:text-accent transition-colors">
          {category.title}
        </h2>
        <span className="text-xs text-text-faint">#{category.order}</span>
      </div>
      {category.description && (
        <p className="text-sm text-text-soft mb-3">{category.description}</p>
      )}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-surface-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <span className="text-xs text-text-faint">
          {done}/{totalExercises}
        </span>
      </div>
    </Link>
  );
}
