import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { AppShell } from "@/app/components/app-shell";
import { SectionHeading } from "@/app/components/section-heading";
import { explorerPages } from "@/app/lib/page-metadata";

const featureGroups = [
  {
    title: "Route prediction features",
    source: "mart_route_prediction_features",
    items: [
      "Run-route grain with activity date, route id, and route distance bucket.",
      "Route shape and terrain fields including segment count, average grade, altitude range, ascent, and descent.",
      "Run outcome labels for completion distance, duration, average pace, and average heart rate.",
    ],
  },
  {
    title: "Weekly training features",
    source: "mart_weekly_training_features",
    items: [
      "Completed-week grain inherited from mart_weeks.",
      "Current and prior-week run count, distance, duration, active-week flag, and resting heart rate.",
      "Next-week run count, distance, duration, and active-week labels for future forecasting experiments.",
    ],
  },
  {
    title: "Recent training context",
    source: "mart_run_sessions, mart_days",
    items: [
      "Prior 7-day and 28-day run counts before each session.",
      "Prior 7-day and 28-day distance before each session.",
      "Prior 28-day average resting heart rate for session-level context.",
    ],
  },
  {
    title: "Route and history features",
    source: "mart_routes, mart_run_sessions",
    items: [
      "Stable route identity derived from representative H3 path and distance bucket.",
      "Lifetime route run count and historical averages for distance, pace, duration, and heart rate.",
      "Prior same-route run count and prior same-route averages before the target run.",
    ],
  },
  {
    title: "Health context",
    source: "mart_days, silver_health_days",
    items: [
      "Same-day resting heart rate, HRV, HRV status, sleep score, and sleep duration.",
      "Rolling resting heart-rate context for daily and session-level analysis.",
      "Payload availability flags so missing Garmin health endpoints remain inspectable.",
    ],
  },
  {
    title: "Labels and outcomes",
    source: "mart_route_prediction_features, mart_weekly_training_features",
    items: [
      "Route-level labels: completion distance, duration, average pace, and average heart rate.",
      "Weekly labels: next-week runs, distance, duration, and active-week flag.",
      "Labels are stored for transparent offline experiments, not live recommendations.",
    ],
  },
];

const useCases = [
  {
    title: "Route pace prediction",
    copy: "Baseline comparisons are testing how route shape, prior route history, recent training, and same-day health context explain pace outcomes.",
  },
  {
    title: "Weekly training load forecasting",
    copy: "Simple baselines are being compared for next-week distance, duration, and active-week labels using completed rollups and lag fields.",
  },
  {
    title: "Completion and duration estimation",
    copy: "Validation experiments are examining duration and completed-distance labels for recurring routes without turning results into coaching recommendations.",
  },
  {
    title: "Descriptive clustering and segmentation",
    copy: "Exploratory grouping is testing whether observed routes, weeks, and sessions expose stable patterns worth expressing as descriptive analytics.",
  },
];

const analyticalValueSteps = [
  {
    title: "Inspect errors and features",
    copy: "Baseline error analysis and feature review can reveal missing context, unstable assumptions, and upstream data-quality gaps.",
  },
  {
    title: "Validate the finding",
    copy: "A result must remain stable, explainable, and analytically useful before it becomes part of the governed model surface.",
  },
  {
    title: "Promote analytical value",
    copy: "Validated findings can become documented and tested gold metrics or features that improve future agent context and visual analysis.",
  },
];

function CodeLabel({ children }: { children: React.ReactNode }) {
  return (
    <code className="border border-(--border) bg-(--surface-muted) px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-(--text)">
      {children}
    </code>
  );
}

export default function MlReadinessPage() {
  return (
    <AppShell>
      <div className="space-y-16">
        <SectionHeading
          eyebrow="feature marts"
          title="ML readiness assets"
          description="Offline baseline comparisons and validation experiments are underway using versioned feature and label marts, while the project deliberately stops short of deployed predictions, recommendations, readiness scores, or coaching."
          icon={explorerPages.mlReadiness.icon}
        />

        <section className="grid border border-(--border) bg-(--surface) md:grid-cols-[15rem_1fr]">
          <div className="border-b border-(--border) bg-(--surface-muted)/60 p-5 md:border-r md:border-b-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-(--accent)">
              experiment_status
            </p>
            <p className="mt-2 font-mono text-xs text-(--signal-ok)">
              offline_baselines: active
            </p>
            <p className="mt-1 font-mono text-xs text-(--text-soft)">
              production_inference: none
            </p>
          </div>
          <p className="max-w-4xl p-5 text-sm leading-7 text-(--text-soft)">
            The active work compares simple offline baselines and validates modeling assumptions.
            Inputs, labels, lineage, and missing-data behavior remain inspectable, but this site does
            not train or serve models, claim performance, or convert experimental outputs into
            athlete guidance.
          </p>
        </section>

        <section>
          <SectionHeading
            eyebrow="01 / Feature library"
            title="Versioned inputs keep experiments inspectable."
            description="Active baseline and validation work uses explicit grains, sources, and labels without presenting experimental results as live intelligence."
            level={2}
          />
          <div className="mt-8 border-t border-(--border)">
            {featureGroups.map((group, index) => (
              <article
                key={group.title}
                className="grid gap-5 border-x border-b border-(--border) bg-(--surface)/50 p-5 md:grid-cols-[2rem_minmax(12rem,0.75fr)_minmax(0,1.25fr)] md:p-6"
              >
                <span className="font-mono text-[10px] text-(--text-soft)">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="text-lg font-medium text-(--text)">{group.title}</h3>
                  <div className="mt-3">
                    <CodeLabel>{group.source}</CodeLabel>
                  </div>
                </div>
                <ul className="space-y-3 text-sm leading-6 text-(--text-soft)">
                  {group.items.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span className="mt-0.5 font-mono text-(--accent)" aria-hidden="true">
                        +
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section>
          <SectionHeading
            eyebrow="02 / Active experiments"
            title="Baseline and validation work stays offline."
            description="These use cases are being explored against versioned feature and label marts. No model performance, published finding, production prediction, or athlete guidance is claimed."
            level={2}
          />
          <div className="mt-8 grid border-l border-t border-(--border) md:grid-cols-2 xl:grid-cols-4">
            {useCases.map((useCase, index) => (
              <article
                key={useCase.title}
                className="border-r border-b border-(--border) bg-(--surface)/50 p-5"
              >
                <p className="font-mono text-[10px] text-(--accent)">
                  experiment::{String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-3 text-base font-medium text-(--text)">{useCase.title}</h3>
                <p className="mt-3 text-sm leading-6 text-(--text-soft)">{useCase.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section>
          <SectionHeading
            eyebrow="03 / Analytical value"
            title="Experiments can improve the governed analytics layer."
            description="The useful outcome is not automatically a deployed model. Careful analysis can expose better definitions, missing context, and data-quality work."
            level={2}
          />
          <div className="mt-8 grid border border-(--border) bg-(--surface)/50 lg:grid-cols-[1fr_18rem]">
            <ol className="grid border-b border-(--border) md:grid-cols-3 lg:border-r lg:border-b-0">
              {analyticalValueSteps.map((step, index) => (
                <li
                  key={step.title}
                  className="border-b border-(--border) p-5 last:border-b-0 md:border-r md:border-b-0 md:last:border-r-0"
                >
                  <p className="font-mono text-[10px] text-(--accent)">
                    review::{String(index + 1).padStart(2, "0")}
                  </p>
                  <h3 className="mt-3 text-base font-medium text-(--text)">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-(--text-soft)">{step.copy}</p>
                </li>
              ))}
            </ol>
            <div className="p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-(--accent)">
                serving_boundary
              </p>
              <p className="mt-3 text-sm leading-6 text-(--text-soft)">
                Only deliberately promoted gold outputs can become context for the planned
                read-only MCP interface. Experimental predictions are not passed through directly.
              </p>
              <Link
                href="/agent-interface"
                className="mt-5 inline-flex items-center gap-2 font-mono text-xs font-medium uppercase tracking-[0.08em] text-(--accent) hover:text-(--accent-strong)"
              >
                Review Agent Interface
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
