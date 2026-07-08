import Link from "next/link";
import { ArrowRight, Radar } from "lucide-react";

import { AppShell } from "@/app/components/app-shell";
import { LandingStatusPanel } from "@/app/components/landing-status-panel";
import { PipelineScroller } from "@/app/components/pipeline-scroller";
import { SectionHeading } from "@/app/components/section-heading";
import { TechLogoGrid } from "@/app/components/tech-logo";
import { explorerNavItems, explorerPages } from "@/app/lib/page-metadata";

const pillars = [
  {
    title: "Consistency",
    href: "/consistency",
    icon: explorerPages.consistency.icon,
    copy: "Measures whether training is happening regularly: active days, active weeks, streaks, and missed-week patterns.",
  },
  {
    title: "Volume",
    href: "/volume",
    icon: explorerPages.volume.icon,
    copy: "Tracks accumulated training load through weekly and monthly distance, rolling totals, and long-run contribution.",
  },
  {
    title: "Fitness",
    href: "/fitness",
    icon: explorerPages.fitness.icon,
    copy: "Keeps the claims descriptive: pace versus heart rate, recovery heart rate, resting heart rate, HRV, and sleep context.",
  },
];

export default function Home() {
  return (
    <AppShell>
      <div>
        <section className="grid min-h-[calc(100vh-9rem)] gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-2 rounded-md border border-(--border) bg-(--surface) px-3 py-2 text-sm text-(--text-soft)">
              <span className="h-2 w-2 rounded-full bg-(--signal-ok)" />
              Live analytics engineering project
            </div>
            <h1 className="mt-6 text-4xl font-semibold text-(--text) sm:text-6xl">
              Running Signals
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-(--text-soft)">
              A Garmin-to-signal-marts lakehouse project that turns personal running data into
              reliable outputs for frontend explorers and downstream ML use cases, with Python
              ingestion, Databricks storage, dbt modeling, SQL, and data quality checks kept
              explicit.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="#methodology"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-(--accent) px-5 text-sm font-semibold text-(--accent-foreground) hover:bg-(--accent-strong)"
              >
                View methodology
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/runs"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-(--border) bg-(--surface) px-5 text-sm font-semibold text-(--text) hover:bg-(--surface-muted)"
              >
                Open explorers
              </Link>
            </div>
          </div>

          <div className="rounded-md border border-(--border) bg-(--surface) p-5 shadow-[0_0_40px_rgba(34,211,238,0.08)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-(--accent)">
                  Gold mart status
                </p>
                <h2 className="mt-2 text-xl font-semibold text-(--text)">Production-shaped demo</h2>
              </div>
              <Radar className="h-6 w-6 text-(--accent)" aria-hidden="true" />
            </div>
            <div className="mt-5">
              <LandingStatusPanel />
            </div>
          </div>
        </section>

        <div className="mt-16 space-y-28 sm:mt-20 sm:space-y-32 lg:space-y-36">
          <section className="space-y-6">
            <SectionHeading
              eyebrow="Analysis pillars"
              title="Three signal families, no coaching claims."
              description="Running Signals focuses on explainable training signals that are straightforward to validate from the modeled data."
            />
            <div className="grid gap-4 md:grid-cols-3">
              {pillars.map((pillar) => {
                const Icon = pillar.icon;
                return (
                  <Link
                    key={pillar.title}
                    href={pillar.href}
                    className="group rounded-md border border-(--border) bg-(--surface) p-5 transition hover:border-(--accent) hover:bg-(--surface-muted)"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <Icon className="h-5 w-5 text-(--accent)" aria-hidden="true" />
                      <ArrowRight
                        className="h-4 w-4 text-(--text-soft) transition group-hover:translate-x-1 group-hover:text-(--accent)"
                        aria-hidden="true"
                      />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-(--text)">{pillar.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-(--text-soft)">{pillar.copy}</p>
                  </Link>
                );
              })}
            </div>
          </section>

          <section id="methodology" className="scroll-mt-24 space-y-6">
            <SectionHeading
              eyebrow="Methodology"
              title="Medallion Architecture from Garmin payloads to analytical marts."
              description="The pipeline keeps ingestion, bronze preservation, silver standardization, and gold signal marts separate so lineage, data quality, and analytical definitions remain explicit."
            />
            <PipelineScroller />
          </section>

          <section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
            <SectionHeading
              eyebrow="Stack"
              title="Tools chosen for a realistic analytics engineering workflow."
              description="The project keeps the stack recognizable and explainable: Python for ingestion, S3 and Databricks for lakehouse storage, dbt and SQL for transformations, and Next.js for frontend explorers."
            />
            <TechLogoGrid />
          </section>

          <section className="rounded-md border border-(--border) bg-(--surface) p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-(--accent)">
                  Explore pages
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-(--text)">
                  Databricks-backed views.
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {explorerNavItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="inline-flex h-10 items-center gap-2 rounded-md border border-(--border) px-4 text-sm font-semibold text-(--text) hover:bg-(--surface-muted)"
                    >
                      <Icon className="h-4 w-4 text-(--accent)" aria-hidden="true" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
