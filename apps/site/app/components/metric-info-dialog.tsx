"use client";

import { Info, X } from "lucide-react";
import { useEffect, useId, useState } from "react";

export type MetricInfoContent = {
  title: string;
  definition: string;
  source: string;
  interpretation: string[];
  caveats?: string[];
};

type MetricInfoDialogProps = {
  content: MetricInfoContent;
  label?: string;
};

export function MetricInfoDialog({ content, label }: MetricInfoDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const dialogLabel = label ?? `Show metric notes for ${content.title}`;

  useEffect(() => {
    if (!isOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        aria-label={dialogLabel}
        title={dialogLabel}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-(--border) text-(--text-soft) transition hover:bg-(--surface-muted) hover:text-(--text)"
        onClick={() => setIsOpen(true)}
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6"
          onMouseDown={() => setIsOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            className="max-h-[calc(100vh-3rem)] w-full max-w-xl overflow-y-auto rounded-md border border-(--border) bg-(--surface) p-5 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase text-(--text-soft)">
                  Metric Notes
                </p>
                <h2 id={titleId} className="mt-1 text-lg font-semibold text-(--text)">
                  {content.title}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close metric notes"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-(--border) text-(--text-soft) transition hover:bg-(--surface-muted) hover:text-(--text)"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-5 space-y-5 text-sm leading-6 text-(--text-soft)">
              <section>
                <h3 className="text-xs font-semibold uppercase text-(--text)">
                  Definition
                </h3>
                <p id={descriptionId} className="mt-2">
                  {content.definition}
                </p>
                <p className="mt-2 text-xs text-(--text-soft)">Source: {content.source}</p>
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase text-(--text)">
                  How To Read It
                </h3>
                <ul className="mt-2 space-y-2">
                  {content.interpretation.map((note) => (
                    <li key={note} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-(--accent)" />
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {content.caveats && content.caveats.length > 0 ? (
                <section>
                  <h3 className="text-xs font-semibold uppercase text-(--text)">
                    Interpretation Notes
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {content.caveats.map((note) => (
                      <li key={note} className="flex gap-2">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-(--signal)" />
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
