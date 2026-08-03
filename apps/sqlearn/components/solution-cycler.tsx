"use client";

import type { SolutionFile } from "@/lib/types";

interface SolutionCyclerProps {
  solutions: SolutionFile[];
  currentIndex: number;
  onSelect: (index: number) => void;
}

export default function SolutionCycler({
  solutions,
  currentIndex,
  onSelect,
}: SolutionCyclerProps) {
  if (solutions.length === 0) return null;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < solutions.length - 1;

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-text-faint">Solutions:</span>
      <button
        onClick={() => onSelect(currentIndex - 1)}
        disabled={!hasPrev}
        className="px-2 py-0.5 border border-border hover:bg-surface-muted disabled:opacity-30 disabled:cursor-default text-text-soft transition-colors"
      >
        Prev
      </button>
      <span className="text-text min-w-[80px] text-center">
        {currentIndex + 1} / {solutions.length}
      </span>
      <button
        onClick={() => onSelect(currentIndex + 1)}
        disabled={!hasNext}
        className="px-2 py-0.5 border border-border hover:bg-surface-muted disabled:opacity-30 disabled:cursor-default text-text-soft transition-colors"
      >
        Next
      </button>
      <select
        value={currentIndex}
        onChange={(e) => onSelect(Number(e.target.value))}
        className="ml-2 bg-surface-muted border border-border px-2 py-0.5 text-text text-sm"
      >
        {solutions.map((s, i) => (
          <option key={s.fileName} value={i}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}
