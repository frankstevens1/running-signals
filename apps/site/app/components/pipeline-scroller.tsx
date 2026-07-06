"use client";

import { useEffect, useRef, useState } from "react";
import { Database, FileArchive, Layers3, RadioTower } from "lucide-react";

const steps = [
  {
    id: "ingest",
    label: "Ingest",
    title: "Python lands Garmin source payloads.",
    icon: RadioTower,
    copy: "Ingestion jobs authenticate to Garmin Connect, download FIT and health payloads, and write source files into the raw S3 landing zone before analytical assumptions are applied.",
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
    copy: "dbt silver models clean, type, deduplicate, and standardize run, record, date, week, and health-day entities into tested building blocks for downstream analytics.",
  },
  {
    id: "gold",
    label: "Gold",
    title: "Gold publishes analytical signal marts.",
    icon: Database,
    copy: "Gold models encode consistency, volume, route, and descriptive fitness definitions as marts for frontend explorers and downstream ML feature work. The website reads those marts through server-side Databricks SQL calls.",
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
    <div className="relative">
      <div aria-hidden="true" className="absolute inset-y-0 left-0 hidden w-14 lg:block">
        <div className="absolute bottom-[35vh] left-7 top-[35vh] w-px bg-(--border)" />
        <div className="grid h-full grid-rows-4">
          {steps.map((step, index) => {
            const active = step.id === activeStep;

            return (
              <div key={step.id} className="flex items-center justify-center">
                <span
                  className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition-colors ${
                    active
                      ? "border-(--accent) bg-(--accent) text-(--accent-foreground) shadow-[0_0_22px_rgba(34,211,238,0.28)]"
                      : "border-(--border) bg-(--background) text-(--text-soft)"
                  }`}
                >
                  {index + 1}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-5 lg:space-y-0 lg:pl-20">
        {steps.map((step) => {
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
              className="scroll-mt-24 py-3 lg:grid lg:min-h-[64vh] lg:grid-cols-[auto_1fr] lg:items-center lg:gap-8 lg:py-0"
            >
              <div
                aria-hidden="true"
                className={`hidden h-px w-8 lg:block ${
                  active ? "bg-(--accent)" : "bg-(--border)"
                }`}
              />
              <article
                className={`max-w-3xl rounded-md border p-6 transition-colors lg:p-8 ${
                  active
                    ? "border-(--accent) bg-(--surface) shadow-[0_0_38px_rgba(34,211,238,0.14)]"
                    : "border-(--border) bg-(--surface)/80"
                }`}
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-md ${
                    active
                      ? "bg-(--accent) text-(--accent-foreground)"
                      : "bg-(--surface-muted) text-(--accent)"
                  }`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <p
                  className={`mt-5 text-xs font-semibold uppercase tracking-normal ${
                    active ? "text-(--accent)" : "text-(--text-soft)"
                  }`}
                >
                  {step.label}
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-(--text)">{step.title}</h3>
                <p className="mt-4 text-sm leading-6 text-(--text-soft)">{step.copy}</p>
              </article>
            </section>
          );
        })}
      </div>
    </div>
  );
}
