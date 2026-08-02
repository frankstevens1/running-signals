"use client";

import { useState, useCallback, useEffect } from "react";

const PROGRESS_KEY = "sqlearn-progress";

interface ProgressEntry {
  completed: boolean;
  completedAt?: number;
}

interface ProgressState {
  [categoryId: string]: {
    [exerciseId: string]: ProgressEntry;
  };
}

function loadProgress(): ProgressState {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw ? (JSON.parse(raw) as ProgressState) : {};
  } catch {
    return {};
  }
}

function saveProgress(state: ProgressState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(state));
  } catch {}
}

export function useProgress() {
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState<ProgressState>({});

  useEffect(() => {
    setProgress(loadProgress());
    setLoaded(true);
  }, []);

  const toggleExercise = useCallback(
    (categoryId: string, exerciseId: string) => {
      setProgress((prev) => {
        const next = { ...prev };
        const cat = { ...(next[categoryId] ?? {}) };
        const entry = cat[exerciseId];

        if (entry?.completed) {
          cat[exerciseId] = { completed: false };
        } else {
          cat[exerciseId] = { completed: true, completedAt: Date.now() };
        }

        next[categoryId] = cat;
        saveProgress(next);
        return next;
      });
    },
    []
  );

  const isCompleted = useCallback(
    (categoryId: string, exerciseId: string): boolean => {
      if (!loaded) return false;
      return !!progress[categoryId]?.[exerciseId]?.completed;
    },
    [progress, loaded]
  );

  const categoryProgress = useCallback(
    (categoryId: string, totalExercises: number): number => {
      if (!loaded) return 0;
      const cat = progress[categoryId] ?? {};
      return Object.values(cat).filter((e) => e.completed).length;
    },
    [progress, loaded]
  );

  return { progress, toggleExercise, isCompleted, categoryProgress };
}
