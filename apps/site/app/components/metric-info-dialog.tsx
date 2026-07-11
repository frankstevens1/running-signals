"use client";

import { Info, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ConsoleLabel } from "@/app/components/console-primitives";

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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogLabel = label ?? `Show metric notes for ${content.title}`;

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    document.body.style.overflow = "hidden";

    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );

      if (!focusableElements || focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement?.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement?.focus();
      }
    }

    document.addEventListener("keydown", handleDialogKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleDialogKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={dialogLabel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        title={dialogLabel}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-(--border) text-(--text-soft) transition-colors hover:border-(--accent) hover:bg-(--surface-muted) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
        onClick={() => setIsOpen(true)}
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </button>

      {isOpen
        ? createPortal(
            <div
              className="fixed inset-x-0 top-0 z-[100] flex h-dvh items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm"
              onClick={(event) => {
                if (event.target === event.currentTarget) setIsOpen(false);
              }}
            >
              <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                tabIndex={-1}
                className="max-h-[calc(100dvh-3rem)] w-full max-w-xl overflow-y-auto border border-(--border) bg-(--surface) text-(--text) shadow-(--shadow-dialog) outline-none"
              >
                <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-(--border) bg-(--surface-muted) px-5 py-4">
                  <div className="min-w-0">
                    <ConsoleLabel>metric_notes</ConsoleLabel>
                    <h2 id={titleId} className="mt-2 text-lg font-semibold text-(--text)">
                      {content.title}
                    </h2>
                  </div>
                  <button
                    ref={closeButtonRef}
                    type="button"
                    aria-label="Close metric notes"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-(--border) text-(--text-soft) transition-colors hover:border-(--accent) hover:bg-(--surface) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
                    onClick={() => setIsOpen(false)}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="space-y-6 p-5 text-sm leading-6 text-(--text-soft)">
                  <section className="border border-(--border)">
                    <div className="border-b border-(--border) bg-(--surface-muted) px-4 py-2.5">
                      <ConsoleLabel className="text-(--text)">definition</ConsoleLabel>
                    </div>
                    <p id={descriptionId} className="px-4 pt-4">
                      {content.definition}
                    </p>
                    <dl className="m-4 grid grid-cols-[auto_1fr] gap-3 border-t border-(--border) pt-3 font-mono text-xs">
                      <dt className="uppercase tracking-wide text-(--text-soft)">Source</dt>
                      <dd className="text-(--text)">{content.source}</dd>
                    </dl>
                  </section>

                  <section>
                    <ConsoleLabel className="text-(--text)">how_to_read</ConsoleLabel>
                    <ul className="mt-3 divide-y divide-(--border) border-y border-(--border)">
                      {content.interpretation.map((note, index) => (
                        <li key={note} className="flex gap-2">
                          <span
                            className="py-3 font-mono text-xs text-(--accent)"
                            aria-hidden="true"
                          >
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span className="py-3">{note}</span>
                        </li>
                      ))}
                    </ul>
                  </section>

                  {content.caveats && content.caveats.length > 0 ? (
                    <section className="border-l-2 border-(--signal-warn) pl-4">
                      <ConsoleLabel className="text-(--text)">
                        interpretation_notes
                      </ConsoleLabel>
                      <ul className="mt-3 space-y-2">
                        {content.caveats.map((note) => (
                          <li key={note} className="flex gap-2">
                            <span className="font-mono text-(--signal-warn)" aria-hidden="true">
                              !
                            </span>
                            <span>{note}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
