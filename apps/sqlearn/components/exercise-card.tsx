"use client";

import { useState, useCallback } from "react";
import SqlEditor from "./sql-editor";
import ResultsTable from "./results-table";
import SolutionCycler from "./solution-cycler";
import { useQueryRunner } from "@/lib/use-query-runner";
import { useLocalSolutions } from "@/lib/use-local-solutions";
import { useProgress } from "@/lib/use-progress";
import type { ExerciseFile, SolutionFile } from "@/lib/types";

interface ExerciseCardProps {
  categoryId: string;
  exercise: ExerciseFile;
  prompt: string;
  solutions: SolutionFile[];
}

export default function ExerciseCard({
  categoryId,
  exercise,
  prompt,
  solutions,
}: ExerciseCardProps) {
  const { result, error, loading, runQuery, clearResult } = useQueryRunner();
  const { isCompleted, toggleExercise } = useProgress();
  const [sql, setSql] = useState("");
  const [showSolution, setShowSolution] = useState(false);
  const [solutionIndex, setSolutionIndex] = useState(0);
  const [solutionContent, setSolutionContent] = useState("");
  const [solutionHtml, setSolutionHtml] = useState("");
  const [saveLabel, setSaveLabel] = useState("");
  const { save, solutions: localSolutions } = useLocalSolutions(categoryId, exercise.id);
  const completed = isCompleted(categoryId, exercise.id);

  const loadSolutionContent = useCallback(
    async (index: number) => {
      const solution = solutions[index];
      if (!solution) return;

      try {
        const contentRes = await fetch(
          `/api/curriculum?category=${categoryId}&exercise=${exercise.id}&solution=${solution.fileName}`,
        );

        if (contentRes.ok) {
          const data = (await contentRes.json()) as { content: string };
          setSolutionContent(data.content);
          setSolutionIndex(index);

          try {
            const hlRes = await fetch("/api/highlight", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sql: data.content }),
            });
            if (hlRes.ok) {
              const hlData = (await hlRes.json()) as { html: string };
              setSolutionHtml(hlData.html);
            }
          } catch {}
        }
      } catch {}
    },
    [categoryId, exercise.id, solutions],
  );

  const handleShowSolution = useCallback(() => {
    if (!showSolution) {
      setShowSolution(true);
      if (solutions.length > 0) {
        loadSolutionContent(0);
      }
    } else {
      setShowSolution(false);
    }
  }, [showSolution, solutions.length, loadSolutionContent]);

  const handleSolutionSelect = useCallback(
    (index: number) => {
      loadSolutionContent(index);
    },
    [loadSolutionContent],
  );

  const handleRun = useCallback(() => {
    if (!sql.trim()) return;
    runQuery(sql.trim());
  }, [sql, runQuery]);

  const handleSaveSolution = useCallback(() => {
    if (!sql.trim() || !saveLabel.trim()) return;
    if (save(saveLabel, sql.trim())) setSaveLabel("");
  }, [save, saveLabel, sql]);

  const handleMarkDone = useCallback(() => {
    toggleExercise(categoryId, exercise.id);
  }, [categoryId, exercise.id, toggleExercise]);

  return (
    <div
      className={`min-w-0 border overflow-hidden transition-colors ${
        completed ? "border-accent/30" : "border-border"
      }`}
    >
      {/* header */}
      <div
        className={`flex items-center justify-between px-5 py-3.5 ${
          completed ? "bg-accent-soft/10" : "bg-surface-muted/50"
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-text-faint">
            {exercise.id}
          </span>
          {completed && (
            <span className="text-xs text-accent font-medium">Done</span>
          )}
        </div>
        <button
          onClick={handleMarkDone}
          className={`text-xs px-3 py-1 border transition-colors ${
            completed
              ? " border-accent/40 text-accent hover:bg-accent-soft/20"
              : " border-border text-text-soft hover:bg-surface-muted"
          }`}
        >
          {completed ? "Undo" : "Mark done"}
        </button>
      </div>

      {/* body */}
      <div className="min-w-0 p-5 space-y-4">
        {/* prompt */}
        {prompt && (
          <div className="p-3.5 bg-surface-muted border border-border/60">
            <p className="text-sm text-text-soft whitespace-pre-wrap leading-relaxed">
              {prompt}
            </p>
          </div>
        )}

        {/* editor */}
        <SqlEditor value={sql} onChange={setSql} />

        {/* actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleRun}
            disabled={loading || !sql.trim()}
            className="px-4 py-1.5 bg-accent text-accent-foreground text-sm font-medium hover:bg-accent-strong disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Running..." : "Run query"}
          </button>

          <button
            onClick={clearResult}
            className="px-3 py-1.5 border border-border text-text-soft text-sm hover:bg-surface-muted transition-colors"
          >
            Clear
          </button>

          <button
            onClick={handleShowSolution}
            className={`px-3 py-1.5 border text-sm transition-colors ${
              showSolution
                ? "border-accent/50 text-accent bg-accent-soft/10"
                : "border-border text-text-soft hover:bg-surface-muted"
            }`}
          >
            {showSolution ? "Hide solution" : "Show solution"}
          </button>

          {sql.trim() && (
            <div className="flex items-center gap-2 ml-auto">
              <input
                type="text"
                value={saveLabel}
                onChange={(e) => setSaveLabel(e.target.value)}
                placeholder="Name your solution..."
                className="px-2.5 py-1 text-xs border border-border bg-surface-muted text-text w-48 focus:outline-none focus:border-accent"
              />
              <button
                onClick={handleSaveSolution}
                disabled={!saveLabel.trim()}
                className="px-2.5 py-1 border border-accent/30 text-accent text-xs hover:bg-accent-soft/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Save locally
              </button>
            </div>
          )}
        </div>

        {localSolutions.length > 0 ? (
          <div className="border border-border bg-surface-muted/50 p-3">
            <p className="text-xs text-text-faint">Saved in this browser</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {localSolutions.map((solution) => (
                <button
                  key={solution.id}
                  type="button"
                  onClick={() => setSql(solution.content)}
                  className="border border-border px-2 py-1 text-xs text-text-soft transition-colors hover:border-accent hover:text-accent"
                >
                  {solution.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* solution panel */}
        {showSolution && solutions.length > 0 && (
          <div className=" border border-border bg-surface-muted/50 p-4">
            <SolutionCycler
              solutions={solutions}
              currentIndex={solutionIndex}
              onSelect={handleSolutionSelect}
            />
            <div className="code-block-wrapper">
              <div
                dangerouslySetInnerHTML={{
                  __html:
                    solutionHtml ||
                    `<pre><code>${escapeHtml(solutionContent || "Loading...")}</code></pre>`,
                }}
              />
            </div>
          </div>
        )}

        {showSolution && solutions.length === 0 && (
          <div className=" border border-border bg-surface-muted/50 p-4 text-sm text-text-faint">
            No solutions available yet. Write your own and save it using the
            input above.
          </div>
        )}

        {/* results / error */}
        {error && (
          <div className=" border border-red-900/30 bg-red-900/10 p-4">
            <div className="text-xs font-semibold text-signal-error mb-1.5">
              Error
            </div>
            <pre className="text-sm text-signal-error/80 font-mono whitespace-pre-wrap leading-relaxed">
              {error}
            </pre>
          </div>
        )}

        {result && (
          <div className=" border border-border bg-surface p-4">
            <ResultsTable result={result} />
          </div>
        )}

        {loading && (
          <div className=" border border-border bg-surface-muted/30 p-6 flex items-center gap-3">
            <div className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
            <span className="text-sm text-text-soft">Running query...</span>
          </div>
        )}
      </div>
    </div>
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
