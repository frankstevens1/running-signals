"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Database, FileArchive, Layers3, RadioTower } from "lucide-react";

const steps = [
  {
    id: "ingest",
    label: "Ingest",
    title: "Python lands Garmin source payloads.",
    icon: RadioTower,
    copy: "Ingestion jobs authenticate to Garmin Connect, download FIT activity payloads, and write source files into the raw S3 landing zone before analytical assumptions are applied.",
  },
  {
    id: "bronze",
    label: "Bronze",
    title: "Bronze preserves source-shaped evidence.",
    icon: FileArchive,
    copy: "Databricks bronze tables keep raw Garmin payloads recoverable with payload lineage intact, so source data can be replayed when parsers, schemas, or signal definitions improve.",
  },
  {
    id: "silver",
    label: "Silver",
    title: "Silver standardizes reusable entities.",
    icon: Layers3,
    copy: "dbt silver models clean, type, deduplicate, and standardize run, record, date, and week entities into tested building blocks for downstream analytics.",
  },
  {
    id: "gold",
    label: "Gold",
    title: "Gold publishes analytical signal marts.",
    icon: Database,
    copy: "Gold models encode consistency, volume, route, and descriptive fitness definitions as marts for frontend explorers and downstream ML feature work. Curated projections are published to Supabase for the website.",
  },
];

export function PipelineScroller() {
  const [activeStep, setActiveStep] = useState(steps[0].id);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    let frameId: number | null = null;

    const updateActiveStep = () => {
      frameId = null;

      const viewportCenter = window.innerHeight / 2;
      const nextStep = steps.reduce(
        (closestStep, step) => {
          const node = sectionRefs.current[step.id];

          if (!node) {
            return closestStep;
          }

          const rect = node.getBoundingClientRect();
          const distance = Math.abs(rect.top + rect.height / 2 - viewportCenter);

          if (distance <= closestStep.distance) {
            return { id: step.id, distance };
          }

          return closestStep;
        },
        { id: steps[0].id, distance: Number.POSITIVE_INFINITY },
      );

      setActiveStep((currentStep) => (currentStep === nextStep.id ? currentStep : nextStep.id));
    };

    const scheduleUpdate = () => {
      if (frameId === null) {
        frameId = window.requestAnimationFrame(updateActiveStep);
      }
    };

    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, []);

  return (
    <div className="relative grid gap-8 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-12">
      <aside className="hidden lg:block" aria-label="Pipeline stages">
        <div className="sticky top-32 border-l border-(--border) py-2">
          {steps.map((step, index) => {
            const active = step.id === activeStep;

            return (
              <div
                key={step.id}
                className={`flex items-center gap-3 border-l py-3 pl-4 font-mono text-xs uppercase tracking-[0.12em] transition-colors ${
                  active
                    ? "-ml-px border-(--accent) text-(--accent)"
                    : "border-transparent text-(--text-soft)"
                }`}
              >
                <span className="w-5 text-right text-[10px] tabular-nums">0{index + 1}</span>
                <span>{step.label}</span>
              </div>
            );
          })}
        </div>
      </aside>

      <div className="border-t border-(--border) lg:border-t-0">
        {steps.map((step, index) => {
          const active = step.id === activeStep;
          const Icon = step.icon;

          return (
            <section
              id={`pipeline-${step.id}`}
              key={step.id}
              ref={(node) => {
                sectionRefs.current[step.id] = node;
              }}
              data-step={step.id}
              className="scroll-mt-28 border-b border-(--border) py-8 lg:flex lg:min-h-[58vh] lg:items-center lg:py-16"
            >
              <article
                className={`w-full max-w-3xl transition-[opacity,transform] duration-500 ${
                  active ? "translate-x-0 opacity-100" : "lg:translate-x-2 lg:opacity-55"
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-(--text-soft)">0{index + 1}</span>
                    <div className="flex h-9 w-9 items-center justify-center border border-(--border) bg-(--surface-muted) text-(--accent)">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-(--signal-ok)">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    complete
                  </span>
                </div>
                <p
                  className={`mt-8 font-mono text-xs uppercase tracking-[0.14em] ${
                    active ? "text-(--accent)" : "text-(--text-soft)"
                  }`}
                >
                  pipeline::{step.id}
                </p>
                <h3 className="mt-3 text-2xl font-medium tracking-[-0.02em] text-(--text) sm:text-3xl">
                  {step.title}
                </h3>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-(--text-soft)">{step.copy}</p>
                {step.id === "ingest" && (
                  <p className="mt-2 max-w-2xl text-xs text-(--text-faint)">
                    These same runs sync to{" "}
                    <a
                      href="https://www.strava.com/athletes/142530754"
                      target="_blank"
                      rel="noreferrer"
                      className="text-(--accent) hover:underline"
                    >
                      Strava
                    </a>
                    .
                  </p>
                )}
              </article>
            </section>
          );
        })}
      </div>
    </div>
  );
}
