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
    <code className="rounded border border-(--border) bg-(--surface-muted) px-2 py-1 font-mono text-xs text-(--text)">
      {children}
    </code>
  );
}

export default function MlReadinessPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <SectionHeading
          eyebrow="feature marts"
          title="ML readiness assets"
          description="The project exposes feature and label tables that could support future modeling experiments, while deliberately stopping short of deployed predictions, recommendations, readiness scores, or coaching."
          icon={explorerPages.mlReadiness.icon}
        />

        <section className="rounded-md border border-(--border) bg-(--surface) p-5">
          <p className="text-xs font-semibold uppercase tracking-normal text-(--accent)">
            Readiness boundary
          </p>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-(--text-soft)">
            These are analytical feature assets. They make model inputs, labels, lineage, and
            missing-data behavior easier to inspect, but this site does not train models, serve
            predictions, or convert the outputs into athlete guidance.
          </p>
        </section>

        <section className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-(--accent)">
              Feature library
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-(--text)">
              Existing marts already separate features from outcomes.
            </h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {featureGroups.map((group) => (
              <article
                key={group.title}
                className="rounded-md border border-(--border) bg-(--surface) p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <h3 className="text-lg font-semibold text-(--text)">{group.title}</h3>
                  <CodeLabel>{group.source}</CodeLabel>
                </div>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-(--text-soft)">
                  {group.items.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-(--accent)" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-(--accent)">
              Potential ML use cases
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-(--text)">
              Future work would start with descriptive, offline experiments.
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {useCases.map((useCase) => (
              <article
                key={useCase.title}
                className="rounded-md border border-(--border) bg-(--surface) p-5"
              >
                <h3 className="text-base font-semibold text-(--text)">{useCase.title}</h3>
                <p className="mt-3 text-sm leading-6 text-(--text-soft)">{useCase.copy}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
