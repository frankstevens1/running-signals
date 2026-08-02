import Link from "next/link";
import { getCategories, getExercises } from "@/lib/curriculum";
import CategoryCardClient from "./category-card-client";

export default function CurriculumPage() {
  const { categories } = getCategories();

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <header className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <Link
              href="/"
              className="text-sm text-text-faint hover:text-text-soft transition-colors"
            >
              sqlearn
            </Link>
          </div>
          <h1 className="text-2xl font-semibold text-text mb-2">
            SQL Curriculum
          </h1>
          <p className="text-text-soft max-w-xl">
            Interactive SQL exercises using your own running data. Work through
            each category, write queries against real tables, and save your
            solutions.
          </p>
          <div className="flex gap-4 mt-4">
            <Link
              href="/playground"
              className="inline-flex items-center px-4 py-2 bg-accent text-accent-foreground text-sm font-medium hover:bg-accent-strong transition-colors"
            >
              Open Playground
            </Link>
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          {categories.map((cat) => {
            const exercises = getExercises(cat.id);
            return (
              <CategoryCardClient
                key={cat.id}
                category={cat}
                totalExercises={exercises.length}
              />
            );
          })}
        </div>

        {categories.length === 0 && (
          <div className="text-center py-20">
            <p className="text-text-faint">
              No categories found. Create one by adding a directory under{" "}
              <code className="text-accent">curriculum/</code> with a{" "}
              <code className="text-accent">notes.md</code> file.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
