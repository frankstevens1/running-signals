export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
}

export interface QueryError {
  error: string;
}

export type Engine = "supabase" | "databricks";

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
  filePath: string;
}

export interface SolutionFile {
  fileName: string;
  label: string;
  filePath: string;
}
