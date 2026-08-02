import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCategory,
  getExercises,
  getSolutions,
  getExerciseContent,
} from "@/lib/curriculum";
import TheoryContent from "@/components/theory-content";
import CategoryDetailClient from "./category-detail-client";

interface Props {
  params: Promise<{ category: string }>;
}

export default async function CategoryPage({ params }: Props) {
  const { category: categoryId } = await params;
  const category = getCategory(categoryId);

  if (!category) {
    notFound();
  }

  const exercises = getExercises(categoryId);

  const exercisesWithData = exercises.map((ex) => {
    const raw = getExerciseContent(categoryId, ex.id) ?? "";
    const prompt = extractPrompt(raw);
    const solutions = getSolutions(categoryId, ex.id);
    return { ...ex, prompt, solutions };
  });

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <header className="mb-10">
          <Link
            href="/"
            className="text-sm text-text-faint hover:text-text-soft transition-colors mb-4 inline-block"
          >
            &larr; All categories
          </Link>
          <h1 className="text-2xl font-semibold text-text mb-2">
            {category.meta.title}
          </h1>
          {category.meta.description && (
            <p className="text-text-soft">{category.meta.description}</p>
          )}
        </header>

        <div className="mb-12">
          <h2 className="text-lg font-medium text-text mb-4">Theory</h2>
          <div className="p-6 border border-border bg-surface">
            <TheoryContent content={category.rawContent} />
          </div>
        </div>

        <div>
          <h2 className="text-lg font-medium text-text mb-4">
            Exercises ({exercises.length})
          </h2>
          <CategoryDetailClient
            categoryId={categoryId}
            exercises={exercisesWithData}
          />
        </div>
      </div>
    </div>
  );
}

function extractPrompt(raw: string): string {
  const lines = raw.split("\n");
  const promptLines: string[] = [];
  let inHeader = false;

  for (const line of lines) {
    if (line.startsWith("--") && !line.startsWith("-- YOUR")) {
      promptLines.push(line.replace(/^--\s?/, ""));
      inHeader = true;
    } else if (inHeader && line.startsWith("-- YOUR")) {
      break;
    } else if (inHeader && !line.startsWith("--")) {
      break;
    }
  }

  return promptLines.join("\n").trim();
}
