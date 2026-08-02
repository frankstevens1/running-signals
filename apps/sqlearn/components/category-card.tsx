import type { CategoryMeta } from "@/lib/types";

interface CategoryCardProps {
  category: CategoryMeta;
  exercisesDone: number;
  totalExercises: number;
}

export default function CategoryCard({
  category,
  exercisesDone,
  totalExercises,
}: CategoryCardProps) {
  const progressPct =
    totalExercises > 0 ? Math.round((exercisesDone / totalExercises) * 100) : 0;

  return (
    <a
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
          {exercisesDone}/{totalExercises}
        </span>
      </div>
    </a>
  );
}
