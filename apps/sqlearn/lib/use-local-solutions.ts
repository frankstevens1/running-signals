"use client";

import { useEffect, useState } from "react";

const MAX_SOLUTIONS_PER_EXERCISE = 20;
const MAX_SOLUTION_LENGTH = 64_000;

export type LocalSolution = {
  content: string;
  id: string;
  label: string;
  savedAt: number;
};

function storageKey(categoryId: string, exerciseId: string) {
  return `sqlearn:solutions:${categoryId}:${exerciseId}`;
}

function parseSolutions(value: string | null): LocalSolution[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((solution): solution is LocalSolution => (
      typeof solution === "object"
      && solution !== null
      && typeof (solution as LocalSolution).id === "string"
      && typeof (solution as LocalSolution).label === "string"
      && typeof (solution as LocalSolution).content === "string"
      && typeof (solution as LocalSolution).savedAt === "number"
    ));
  } catch {
    return [];
  }
}

export function useLocalSolutions(categoryId: string, exerciseId: string) {
  const key = storageKey(categoryId, exerciseId);
  const [solutions, setSolutions] = useState<LocalSolution[]>([]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSolutions(parseSolutions(window.localStorage.getItem(key)));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [key]);

  const save = (label: string, content: string) => {
    const normalizedLabel = label.trim().slice(0, 80);
    if (!normalizedLabel || !content.trim() || content.length > MAX_SOLUTION_LENGTH) return false;

    const next = [{
      content,
      id: crypto.randomUUID(),
      label: normalizedLabel,
      savedAt: Date.now(),
    }, ...solutions].slice(0, MAX_SOLUTIONS_PER_EXERCISE);
    window.localStorage.setItem(key, JSON.stringify(next));
    setSolutions(next);
    return true;
  };

  return { save, solutions };
}
