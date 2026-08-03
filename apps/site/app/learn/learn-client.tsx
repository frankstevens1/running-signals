"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Code,
  FileText,
  Menu,
  RotateCcw,
  X,
} from "lucide-react";
import type { Module, Step } from "./content/curriculum";
import { modules } from "./content/curriculum";

const STORAGE_KEY = "running-signals-learn-step";

function renderCode(text: string): ReactNode {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="rounded bg-(--surface-muted) px-1 py-0.5 font-mono text-[0.9em] text-(--text)">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function loadProgress(total: number): number {
  if (typeof window === "undefined") return 0;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      const parsed = parseInt(stored, 10);
      if (parsed >= 0 && parsed < total) return parsed;
    }
  } catch {
    /* localStorage unavailable */
  }
  return 0;
}

function saveProgress(step: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(step));
  } catch {
    /* localStorage unavailable */
  }
}

interface StepWithCode extends Step {
  codeBlock: ReactNode;
}

export function LearnClient({
  steps,
  totalSteps,
}: {
  steps: StepWithCode[];
  totalSteps: number;
}) {
  const [current, setCurrent] = useState(() => loadProgress(totalSteps));
  const [moduleExpanded, setModuleExpanded] = useState<Record<string, boolean>>({});
  const [showDescription, setShowDescription] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarDialogRef = useRef<HTMLDialogElement>(null);

  const step = steps[current];
  const progressPct = ((current + 1) / totalSteps) * 100;

  const goTo = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, totalSteps - 1));
      setCurrent(clamped);
      saveProgress(clamped);
    },
    [totalSteps],
  );

  const goNext = useCallback(() => goTo(current + 1), [current, goTo]);
  const goPrev = useCallback(() => goTo(current - 1), [current, goTo]);
  const reset = useCallback(() => goTo(0), [goTo]);

  const openSidebar = useCallback(() => {
    const dialog = sidebarDialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    setSidebarOpen(true);
  }, []);

  const closeSidebar = useCallback(() => {
    sidebarDialogRef.current?.close();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (sidebarOpen) return;
      if (e.key === "ArrowRight" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext, goPrev, sidebarOpen]);

  useEffect(() => {
    if (!sidebarOpen) return;

    const root = document.documentElement;
    const body = document.body;
    const rootOverflow = root.style.overflow;
    const bodyOverflow = body.style.overflow;
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";

    return () => {
      root.style.overflow = rootOverflow;
      body.style.overflow = bodyOverflow;
    };
  }, [sidebarOpen]);

  const toggleModule = useCallback((id: string) => {
    setModuleExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const stepModuleIndices = useMemo(() => {
    const map: Record<string, number[]> = {};
    steps.forEach((s, i) => {
      if (!map[s.module]) map[s.module] = [];
      map[s.module].push(i);
    });
    return map;
  }, [steps]);

  function moduleStatus(module: Module): "completed" | "active" | "pending" {
    const indices = stepModuleIndices[module.id] ?? [];
    if (indices.length === 0) return "pending";
    if (indices.includes(current)) return "active";
    if (indices.every((i) => i < current)) return "completed";
    return "pending";
  }

  const currentModule = modules.find((m) => m.id === step.module);

  return (
    <div className="px-4  sm:px-6 lg:px-8">
      {/* Progress bar */}
      <div className="sticky top-[3.5rem] z-30 -mx-4 bg-(--background) px-4 pt-1 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex items-center gap-3 py-1.5">
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-(--text-faint)">
            Step {current + 1} of {totalSteps}
          </span>
          <div className="h-1 flex-1 rounded-full bg-(--surface-muted)">
            <div
              className="h-full rounded-full bg-(--accent) transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-(--text-faint)">
            {Math.round(progressPct)}%
          </span>
        </div>
      </div>

      {/* Mobile navigation */}
      <div className="py-4 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={openSidebar}
            aria-haspopup="dialog"
            aria-expanded={sidebarOpen}
            className="inline-flex shrink-0 items-center gap-1.5 border border-(--border) bg-(--surface) px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-(--text-soft) transition-colors hover:bg-(--surface-muted) hover:text-(--text)"
          >
            <Menu className="h-3.5 w-3.5" aria-hidden="true" />
            Modules
          </button>
          <div className="min-w-0 text-right">
            <p className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-(--text-faint)">
              {currentModule?.label}
            </p>
            <p className="mt-0.5 truncate text-sm font-medium text-(--text)">{step.title}</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={goPrev}
            disabled={current === 0}
            className="inline-flex items-center justify-center gap-1.5 border border-(--border) bg-(--surface) px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-(--text-soft) transition-colors hover:bg-(--surface-muted) hover:text-(--text) disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Previous
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={current === totalSteps - 1}
            className="inline-flex items-center justify-center gap-1.5 border border-(--border) bg-(--surface) px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-(--text-soft) transition-colors hover:bg-(--surface-muted) hover:text-(--text) disabled:cursor-not-allowed disabled:opacity-30"
          >
            Next
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Desktop navigation */}
      <div className="hidden grid-cols-[1fr_auto_1fr] items-center gap-2 py-4 lg:grid">
        <button
          onClick={goPrev}
          disabled={current === 0}
          className="justify-self-start inline-flex shrink-0 items-center gap-1.5 border border-(--border) bg-(--surface) px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-(--text-soft) transition-colors hover:bg-(--surface-muted) hover:text-(--text) disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Previous
        </button>

        <div className="text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-(--text-faint)">
            {currentModule?.label}
          </p>
          <p className="mt-0.5 text-sm font-medium text-(--text)">{step.title}</p>
        </div>

        <button
          onClick={goNext}
          disabled={current === totalSteps - 1}
          className="justify-self-end inline-flex shrink-0 items-center gap-1.5 border border-(--border) bg-(--surface) px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-(--text-soft) transition-colors hover:bg-(--surface-muted) hover:text-(--text) disabled:cursor-not-allowed disabled:opacity-30"
        >
          Next
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <dialog
        ref={sidebarDialogRef}
        aria-labelledby="learn-module-dialog-title"
        onClose={() => setSidebarOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeSidebar();
        }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[min(24rem,calc(100%-2rem))] overflow-y-auto border border-(--border-strong) bg-(--surface) p-0 text-(--text) shadow-[var(--shadow-dialog)] backdrop:bg-black/70 lg:hidden"
      >
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-(--border) bg-(--surface-muted) px-4 py-3">
          <p id="learn-module-dialog-title" className="font-mono text-xs uppercase tracking-[0.12em] text-(--accent)">
            Module progress
          </p>
          <button
            type="button"
            aria-label="Close modules"
            onClick={closeSidebar}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-(--border) text-(--text-soft) transition-colors hover:bg-(--surface) hover:text-(--text)"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>
        <div className="p-4">
          <ModuleProgress
            modules={modules}
            moduleStatus={moduleStatus}
            moduleExpanded={moduleExpanded}
            toggleModule={toggleModule}
            stepModuleIndices={stepModuleIndices}
            steps={steps}
            current={current}
            goTo={(i) => {
              goTo(i);
              closeSidebar();
            }}
            reset={reset}
          />
        </div>
      </dialog>

      {/* Main layout: sidebar + content */}
      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        {/* Desktop sidebar */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-[7.5rem]">
            <ModuleProgress
              modules={modules}
              moduleStatus={moduleStatus}
              moduleExpanded={moduleExpanded}
              toggleModule={toggleModule}
              stepModuleIndices={stepModuleIndices}
              steps={steps}
              current={current}
              goTo={goTo}
              reset={reset}
            />
          </div>
        </aside>

        {/* Content area */}
        <div className="min-w-0 flex-1">
          {/* Description / Code toggle */}
          <div className="mb-4 flex border border-(--border)">
            <button
              onClick={() => setShowDescription(true)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors ${
                showDescription
                  ? "bg-(--accent-soft) text-(--accent)"
                  : "text-(--text-faint) hover:text-(--text-soft)"
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              Description
            </button>
            <button
              onClick={() => setShowDescription(false)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors ${
                !showDescription
                  ? "bg-(--accent-soft) text-(--accent)"
                  : "text-(--text-faint) hover:text-(--text-soft)"
              }`}
            >
              <Code className="h-3.5 w-3.5" />
              {step.codeLang === "yml" ? "YAML" : "SQL"}
            </button>
          </div>

          {showDescription ? (
            <div className="border border-(--border) bg-(--surface) p-5 lg:p-6">
              {step.lineageContext && (
                <div className="mb-4 border-l-2 border-(--accent) bg-(--surface-muted) px-3 py-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-(--accent)">
                    Lineage
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-(--text-soft)">
                    {renderCode(step.lineageContext)}
                  </p>
                </div>
              )}

              <div className="text-sm leading-7 text-(--text-soft) [&_p]:mb-3">
                {step.context.split("\n\n").map((paragraph, i) => (
                  <p key={i}>{renderCode(paragraph)}</p>
                ))}
              </div>

              {step.keyTechnique && (
                <div className="mt-5 border border-(--border) bg-(--background) px-4 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-(--text-faint)">
                    Key Technique
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-(--text)">
                    {renderCode(step.keyTechnique)}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="min-w-0">
              <div className="flex items-center justify-between border border-(--border) border-b-0 bg-(--surface-muted) px-4 py-2.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-(--text-faint)">
                  {step.codeLang === "yml" ? "YAML" : "SQL"}
                </span>
                <span className="font-mono text-[10px] text-(--text-faint)">
                  {step.sql.split("\n").length} lines
                </span>
              </div>
              {step.codeBlock}
            </div>
          )}
        </div>
      </div>

      {/* Bottom navigation */}
      <div className="mt-8 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <button
          onClick={goPrev}
          disabled={current === 0}
          className="justify-self-start inline-flex shrink-0 items-center gap-1.5 border border-(--border) bg-(--surface) px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-(--text-soft) transition-colors hover:bg-(--surface-muted) hover:text-(--text) disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Previous
        </button>

        <span className="text-center font-mono text-[10px] text-(--text-faint)">
          {current + 1} / {totalSteps}
        </span>

        <button
          onClick={goNext}
          disabled={current === totalSteps - 1}
          className="justify-self-end inline-flex shrink-0 items-center gap-1.5 border border-(--border) bg-(--surface) px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-(--text-soft) transition-colors hover:bg-(--surface-muted) hover:text-(--text) disabled:cursor-not-allowed disabled:opacity-30"
        >
          Next
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <p className="mt-4 text-center font-mono text-[10px] text-(--text-faint)">
        Tip: Use ← and → arrow keys to navigate between steps.
      </p>
    </div>
  );
}

function ModuleProgress({
  modules,
  moduleStatus,
  moduleExpanded,
  toggleModule,
  stepModuleIndices,
  steps,
  current,
  goTo,
  reset,
}: {
  modules: Module[];
  moduleStatus: (mod: Module) => "completed" | "active" | "pending";
  moduleExpanded: Record<string, boolean>;
  toggleModule: (id: string) => void;
  stepModuleIndices: Record<string, number[]>;
  steps: StepWithCode[];
  current: number;
  goTo: (index: number) => void;
  reset: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-(--text-faint)">
          Module Progress
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-1 font-mono uppercase tracking-[0.08em] text-(--text-faint) transition-colors hover:text-(--text-soft)"
          style={{ fontSize: "9px" }}
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </button>
      </div>

      <div className="mt-3 space-y-1">
        {modules.map((mod) => {
          const status = moduleStatus(mod);
          const isExpanded = moduleExpanded[mod.id] ?? (status === "active");

          return (
            <div key={mod.id}>
              <button
                onClick={() => toggleModule(mod.id)}
                className="flex w-full items-center gap-2 py-2 text-left transition-colors hover:text-(--text)"
              >
                <span className="shrink-0 font-mono text-xs">
                  {status === "completed" ? (
                    <span className="text-(--signal-ok)">✓</span>
                  ) : status === "active" ? (
                    <span className="text-(--accent)">●</span>
                  ) : (
                    <span className="text-(--text-faint)">○</span>
                  )}
                </span>
                <span
                  className={`font-mono text-[10px] uppercase tracking-[0.06em] leading-tight ${
                    status === "active"
                      ? "font-medium text-(--text)"
                      : "text-(--text-soft)"
                  }`}
                >
                  {mod.label}
                </span>
                <ChevronDown
                  className={`ml-auto h-3 w-3 shrink-0 text-(--text-faint) transition-transform ${isExpanded ? "rotate-180" : ""}`}
                />
              </button>

              {isExpanded && (
                <div className="ml-5 mt-1 space-y-0.5 border-l border-(--border) pl-3">
                  {(stepModuleIndices[mod.id] ?? []).map((stepIdx) => {
                    const s = steps[stepIdx];
                    const isCurrent = stepIdx === current;
                    const isPast = stepIdx < current;

                    return (
                      <button
                        key={s.id}
                        onClick={() => goTo(stepIdx)}
                        className={`block w-full truncate py-0.5 text-left font-mono transition-colors ${
                            isCurrent
                              ? "font-medium text-(--accent)"
                              : isPast
                                ? "text-(--text-soft) hover:text-(--text)"
                                : "text-(--text-faint) hover:text-(--text-soft)"
                        }`}
                        style={{ fontSize: "12px", lineHeight: "1.3" }}
                      >
                        {isCurrent ? "▸ " : isPast ? "  " : "  "}
                        {s.title}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
