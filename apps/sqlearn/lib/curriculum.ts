import "server-only";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CURRICULUM_DIR = join(process.cwd(), "curriculum");

export interface CategoryMeta {
  id: string;
  order: number;
  title: string;
  description: string;
}

export interface CategoryIndex {
  categories: CategoryMeta[];
}

export interface ExerciseFile {
  id: string;
  fileName: string;
  difficulty: "easy" | "medium" | "hard";
}

export interface SolutionFile {
  fileName: string;
  label: string;
}

function cleanFileName(fileName: string): string {
  return fileName.replace(/^\d+-/, "");
}

function parseDifficulty(fileName: string): "easy" | "medium" | "hard" {
  const lower = fileName.toLowerCase();
  if (lower.includes("hard")) return "hard";
  if (lower.includes("medium")) return "medium";
  return "easy";
}

function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };
  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^([^:]+):\s*(.*)$/);
    if (kv) {
      let value = kv[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      frontmatter[kv[1].trim()] = value;
    }
  }
  return { frontmatter, body: match[2] };
}

export function getCategories(): CategoryIndex {
  const dirs = readdirSync(CURRICULUM_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const categories: CategoryMeta[] = [];

  for (const dir of dirs) {
    const notesPath = join(CURRICULUM_DIR, dir, "notes.md");
    if (!existsSync(notesPath)) continue;

    const raw = readFileSync(notesPath, "utf-8");
    const { frontmatter } = parseFrontmatter(raw);

    const id = frontmatter.id ?? dir;
    const order = parseInt(frontmatter.order ?? "999", 10);
    const title = frontmatter.title ?? dir;
    const description = frontmatter.description ?? "";

    categories.push({ id, order, title, description });
  }

  categories.sort((a, b) => a.order - b.order);

  return { categories };
}

export function getCategory(id: string): { meta: CategoryMeta; rawContent: string } | null {
  const categoryDir = findCategoryDir(id);
  if (!categoryDir) return null;

  const notesPath = join(categoryDir, "notes.md");
  if (!existsSync(notesPath)) return null;

  const raw = readFileSync(notesPath, "utf-8");
  const { frontmatter, body } = parseFrontmatter(raw);

  const meta: CategoryMeta = {
    id: frontmatter.id ?? id,
    order: parseInt(frontmatter.order ?? "999", 10),
    title: frontmatter.title ?? id,
    description: frontmatter.description ?? "",
  };

  return { meta, rawContent: body };
}

function findCategoryDir(id: string): string | null {
  const dirs = readdirSync(CURRICULUM_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const dir of dirs) {
    const notesPath = join(CURRICULUM_DIR, dir, "notes.md");
    if (!existsSync(notesPath)) continue;
    const raw = readFileSync(notesPath, "utf-8");
    const { frontmatter } = parseFrontmatter(raw);
    if ((frontmatter.id ?? dir) === id) {
      return join(CURRICULUM_DIR, dir);
    }
  }

  return null;
}

export function getExercises(categoryId: string): ExerciseFile[] {
  const categoryDir = findCategoryDir(categoryId);
  if (!categoryDir) return [];

  const exercisesDir = join(categoryDir, "exercises");
  if (!existsSync(exercisesDir)) return [];

  const files = readdirSync(exercisesDir, { withFileTypes: true })
    .filter((f) => f.isFile() && f.name.endsWith(".sql"))
    .map((f) => f.name)
    .sort();

  return files.map((fileName) => {
    const id = fileName.replace(/\.sql$/, "");
    const cleaned = cleanFileName(id);
    return {
      id,
      fileName: cleaned,
      difficulty: parseDifficulty(fileName),
    };
  });
}

export function getExerciseContent(categoryId: string, exerciseId: string): string | null {
  const categoryDir = findCategoryDir(categoryId);
  if (!categoryDir) return null;

  const exercise = getExercises(categoryId).find((candidate) => candidate.id === exerciseId);
  if (!exercise) return null;

  const exercisePath = join(categoryDir, "exercises", `${exercise.id}.sql`);
  if (!existsSync(exercisePath)) return null;

  return readFileSync(exercisePath, "utf-8");
}

export function getSolutions(categoryId: string, exerciseId: string): SolutionFile[] {
  const categoryDir = findCategoryDir(categoryId);
  if (!categoryDir) return [];
  if (!getExercises(categoryId).some((exercise) => exercise.id === exerciseId)) return [];

  const solutionsDir = join(categoryDir, "_solutions", exerciseId);
  if (!existsSync(solutionsDir)) return [];

  const files = readdirSync(solutionsDir, { withFileTypes: true })
    .filter((f) => f.isFile() && f.name.endsWith(".sql"))
    .map((f) => f.name)
    .sort();

  return files.map((fileName) => ({
    fileName,
    label: fileName.replace(/\.sql$/, "").replace(/^\d+-/, "").replace(/-/g, " "),
  }));
}

export function getSolutionContent(
  categoryId: string,
  exerciseId: string,
  solutionFileName: string
): string | null {
  const categoryDir = findCategoryDir(categoryId);
  if (!categoryDir) return null;
  if (!getExercises(categoryId).some((exercise) => exercise.id === exerciseId)) return null;

  const solution = getSolutions(categoryId, exerciseId)
    .find((candidate) => candidate.fileName === solutionFileName);
  if (!solution) return null;

  const solutionPath = join(categoryDir, "_solutions", exerciseId, solution.fileName);
  if (!existsSync(solutionPath)) return null;

  return readFileSync(solutionPath, "utf-8");
}
