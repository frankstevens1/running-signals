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
    copy: "Estimate expected pace for a known route using route shape, prior route history, recent training context, and same-day health context.",
  },
  {
    title: "Weekly training load forecasting",
    copy: "Use completed weekly rollups and prior-week lag fields to test simple forecasts of next-week distance, duration, or active-week status.",
  },
  {
    title: "Completion and duration estimation",
    copy: "Estimate likely run duration or completed distance for recurring routes without turning the result into a coaching recommendation.",
  },
  {
    title: "Descriptive clustering and segmentation",
    copy: "Group routes, weeks, or sessions by observed behavior to explain patterns such as route types, training blocks, or recovery-heavy weeks.",
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
          description="The project exposes feature and label tables that could support future modeling experiments, while deliberately stopping short of deployed predictions, recommendations, readiness scores, or coaching."
          icon={explorerPages.mlReadiness.icon}
        />

        <section className="grid border border-(--border) bg-(--surface) md:grid-cols-[15rem_1fr]">
          <div className="border-b border-(--border) bg-(--surface-muted)/60 p-5 md:border-r md:border-b-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-(--accent)">
              system_boundary
            </p>
            <p className="mt-2 font-mono text-xs text-(--signal-ok)">features_only: true</p>
          </div>
          <p className="max-w-4xl p-5 text-sm leading-7 text-(--text-soft)">
            These are analytical feature assets. They make model inputs, labels, lineage, and
            missing-data behavior easier to inspect, but this site does not train models, serve
            predictions, or convert the outputs into athlete guidance.
          </p>
        </section>

        <section>
          <SectionHeading
            eyebrow="01 / Feature library"
            title="Inputs and outcomes remain explicit."
            description="Prediction-ready assets expose their grain, source, and intended labels without presenting experimental possibilities as live intelligence."
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
            eyebrow="02 / Potential experiments"
            title="Future work starts offline."
            description="These use cases describe technically supported experiments, not shipped predictions, recommendations, or athlete guidance."
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
      </div>
    </AppShell>
  );
}
