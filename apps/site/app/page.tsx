import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Braces, Database } from "lucide-react";

import { AppShell } from "@/app/components/app-shell";
import { LandingStatusPanel } from "@/app/components/landing-status-panel";
import { ScrollReveal, TypedRevealText } from "@/app/components/motion-reveal";
import { PipelineScroller } from "@/app/components/pipeline-scroller";
import { SectionHeading } from "@/app/components/section-heading";
import { TechLogoGrid } from "@/app/components/tech-logo";
import { explorerNavItems, explorerPages } from "@/app/lib/page-metadata";

const pillars = [
  {
    index: "01",
    title: "Consistency",
    command: "signal::consistency",
    href: "/consistency",
    icon: explorerPages.consistency.icon,
    copy: "See whether training is happening regularly through active days, completed weeks, streaks, and breaks.",
    source: "mart_days + mart_weeks",
  },
  {
    index: "02",
    title: "Volume",
    command: "signal::volume",
    href: "/volume",
    icon: explorerPages.volume.icon,
    copy: "Inspect accumulated load through weekly and monthly distance, rolling totals, and long-run contribution.",
    source: "mart_weeks + mart_months",
  },
  {
    index: "03",
    title: "Fitness",
    command: "signal::fitness",
    href: "/fitness",
    icon: explorerPages.fitness.icon,
    copy: "Explore descriptive changes in pace, heart rate, efficiency, recovery HR, HRV, and sleep context.",
    source: "signal_fitness",
  },
];

export default function Home() {
  return (
    <AppShell>
      <div>
        <section className="grid min-h-[calc(100svh-8rem)] gap-12 border-b border-(--border) py-10 lg:grid-cols-[minmax(0,1.12fr)_minmax(22rem,0.88fr)] lg:items-center lg:py-16">
          <div className="max-w-4xl">
            <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.14em] text-(--text-soft)">
              <span className="inline-flex items-center gap-2 text-(--signal-ok)">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-(--signal-ok) opacity-50 motion-reduce:hidden" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-(--signal-ok)" />
                </span>
                live
              </span>
              <span aria-hidden="true">/</span>
              <span>analytics engineering system</span>
            </div>

            <p className="mt-10 flex items-center gap-2 font-mono text-sm text-(--accent)">
              <span aria-hidden="true">$</span>
              <span>inspect running_signals</span>
              <span className="h-4 w-1.5 animate-pulse bg-(--accent) motion-reduce:hidden" aria-hidden="true" />
            </p>
            <h1 className="mt-5 max-w-4xl text-5xl font-medium leading-[1.02] tracking-[-0.045em] text-(--text) sm:text-6xl lg:text-7xl">
              <TypedRevealText text="Personal running data, modeled into signals." characterDelayMs={18} />
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-8 text-(--text-soft) sm:text-lg">
              Running Signals is an end-to-end lakehouse project that makes training patterns
              inspectable—from recoverable Garmin payloads to tested analytical marts and focused
              data explorers.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/runs"
                className="inline-flex h-11 items-center justify-center gap-2 bg-(--accent) px-5 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-(--accent-foreground) transition-colors hover:bg-(--accent-strong)"
              >
                Explore the data
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="#methodology"
                className="inline-flex h-11 items-center justify-center gap-2 border border-(--border) bg-(--surface) px-5 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-(--text) transition-colors hover:border-(--text-soft) hover:bg-(--surface-muted)"
              >
                Trace the pipeline
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>

          <LandingStatusPanel />
        </section>

        <div className="space-y-28 py-24 sm:space-y-32 sm:py-28 lg:space-y-40 lg:py-36">
          <section>
            <SectionHeading
              eyebrow="01 / Signal families"
              title="Three questions, answered with inspectable data."
              description="The experience stays descriptive. It surfaces evidence and definitions without turning observations into coaching or health claims."
              level={2}
            />
            <div className="mt-10 border-t border-(--border)">
              {pillars.map((pillar, index) => {
                const Icon = pillar.icon;

                return (
                  <ScrollReveal key={pillar.title} delayMs={index * 70}>
                    <Link
                      href={pillar.href}
                      className="group grid gap-5 border-x border-b border-(--border) bg-(--surface)/40 px-5 py-7 transition-colors hover:bg-(--accent-soft) sm:grid-cols-[3rem_2fr_3fr_auto] sm:items-center sm:px-6"
                    >
                      <span className="font-mono text-[10px] text-(--text-soft)">
                        {pillar.index}
                      </span>
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-(--accent)">
                          {pillar.command}
                        </p>
                        <h3 className="mt-1 text-xl font-medium text-(--text)">{pillar.title}</h3>
                      </div>
                      <div>
                        <p className="text-sm leading-6 text-(--text-soft)">{pillar.copy}</p>
                        <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.1em] text-(--text-soft)">
                          source: {pillar.source}
                        </p>
                      </div>
                      <div className="flex h-10 w-10 items-center justify-center border border-(--border) text-(--accent) transition-transform group-hover:translate-x-1 group-hover:border-(--accent)">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </div>
                    </Link>
                  </ScrollReveal>
                );
              })}
            </div>
          </section>

          <section id="methodology" className="scroll-mt-28">
            <SectionHeading
              eyebrow="02 / Methodology"
              title="Follow every signal back to source."
              description="Ingestion, bronze preservation, silver standardization, and gold analytical logic remain separate so lineage and quality are straightforward to inspect."
              level={2}
            />
            <div className="mt-12">
              <PipelineScroller />
            </div>
          </section>

          <section>
            <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
              <div>
                <SectionHeading
                  eyebrow="03 / System stack"
                  title="A production-shaped analytics workflow."
                  description="Each tool has one explicit job. The architecture favors recoverability, readable transformations, testable definitions, and a deliberately lightweight presentation layer."
                  level={2}
                />
                <div className="mt-8 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-(--text-soft)">
                  <Database className="h-4 w-4 text-(--accent)" aria-hidden="true" />
                  eight connected capabilities
                </div>
              </div>
              <TechLogoGrid />
            </div>
          </section>

          <section className="border border-(--border) bg-(--surface)">
            <div className="grid gap-8 p-6 lg:grid-cols-[0.75fr_1.25fr] lg:p-10">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-(--accent)">
                  04 / Explore
                </p>
                <h2 className="mt-3 text-3xl font-medium tracking-[-0.025em] text-(--text)">
                  Query the finished system.
                </h2>
                <p className="mt-4 max-w-xl text-sm leading-7 text-(--text-soft)">
                  Move from individual sessions and route geometry to consistency, volume, fitness,
                  and prediction-ready feature assets.
                </p>
                <p className="mt-6 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-(--text-soft)">
                  <Braces className="h-4 w-4 text-(--accent)" aria-hidden="true" />
                  tip: press cmd/ctrl + k
                </p>
              </div>
              <div className="grid border-l border-t border-(--border) sm:grid-cols-2">
                {explorerNavItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="group flex min-h-24 items-center justify-between gap-4 border-r border-b border-(--border) px-4 py-5 transition-colors hover:bg-(--accent-soft)"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Icon className="h-4 w-4 shrink-0 text-(--accent)" aria-hidden="true" />
                        <span className="font-mono text-xs uppercase tracking-[0.08em] text-(--text)">
                          {item.label}
                        </span>
                      </div>
                      <ArrowUpRight
                        className="h-4 w-4 shrink-0 text-(--text-soft) transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-(--accent)"
                        aria-hidden="true"
                      />
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
