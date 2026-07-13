import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { AppShell } from "@/app/components/app-shell";
import { SectionHeading } from "@/app/components/section-heading";
import { explorerPages } from "@/app/lib/page-metadata";

const interfaceFlow = [
  {
    title: "User query",
    copy: "A running question expressed in the consuming application.",
  },
  {
    title: "Application agent",
    copy: "An agent and MCP client identify the bounded analytical task.",
  },
  {
    title: "Read-only MCP tool",
    copy: "A typed tool validates parameters and selects an approved query path.",
  },
  {
    title: "Databricks gold models",
    copy: "Documented signal, route, session, and calendar models supply governed metrics.",
  },
  {
    title: "Structured evidence",
    copy: "The interface returns values, provenance, freshness, caveats, and visual intent.",
  },
  {
    title: "Application rendering",
    copy: "The mobile or web client renders the chart, map, table, and written analysis.",
  },
];

const queryExamples = [
  {
    title: "Volume trends",
    query: "How has my weekly distance changed over the last 12 weeks?",
    output: "Weekly line chart with rolling context and a concise trend summary.",
  },
  {
    title: "Route comparisons",
    query: "Compare my recent runs on this route with earlier attempts.",
    output: "Route map, comparison table, and pace and heart-rate differences.",
  },
  {
    title: "Consistency",
    query: "Where have breaks appeared in my training this year?",
    output: "Calendar or weekly bars with active weeks, missed weeks, and streak evidence.",
  },
  {
    title: "Fitness efficiency",
    query: "Is pace at a similar heart rate changing over time?",
    output: "Pace-versus-heart-rate trend with sample context and analytical caveats.",
  },
];

const plannedTools = [
  {
    name: "get_training_summary",
    copy: "Return bounded consistency, volume, and fitness summaries for a requested period.",
  },
  {
    name: "get_volume_trend",
    copy: "Return daily, weekly, or monthly distance and duration series with defined rollups.",
  },
  {
    name: "compare_route_runs",
    copy: "Compare performance across runs on the same governed route.",
  },
  {
    name: "get_fitness_trend",
    copy: "Return descriptive pace, heart-rate, efficiency, and recovery context over time.",
  },
];

const plannedResources = [
  {
    uri: "running-signals://definitions/signals",
    copy: "Metric definitions, analytical assumptions, and interpretation boundaries.",
  },
  {
    uri: "running-signals://catalog/gold-models",
    copy: "Approved models, grains, fields, and lineage available to the tool layer.",
  },
  {
    uri: "running-signals://status/freshness",
    copy: "Latest modeled dates and refresh context for evidence returned to a user.",
  },
  {
    uri: "running-signals://status/quality",
    copy: "Relevant test coverage, missing-data flags, and known limitations.",
  },
];

const responseFields = [
  {
    name: "summary",
    copy: "A short, descriptive answer grounded in the returned values.",
  },
  {
    name: "evidence",
    copy: "Typed metrics, series, comparisons, and units needed to inspect the answer.",
  },
  {
    name: "visualization_intent",
    copy: "Chart, map, or table intent with dimensions, measures, and display hints.",
  },
  {
    name: "provenance",
    copy: "Gold model names, metric definitions, filters, and query parameters.",
  },
  {
    name: "freshness",
    copy: "The latest included data and the relevant pipeline refresh state.",
  },
  {
    name: "caveats",
    copy: "Missing context, sample-size limits, and non-medical interpretation boundaries.",
  },
];

const boundaries = [
  "No arbitrary SQL or unrestricted table access.",
  "No raw FIT, health JSON, or GPS payload access.",
  "No writes, mutations, or pipeline operations.",
  "No medical advice or interpretation.",
  "No readiness scoring or production predictions.",
  "No coaching claims without explicit, qualified analytical support.",
];

function CodeLabel({ children }: { children: React.ReactNode }) {
  return (
    <code className="break-words border border-(--border) bg-(--surface-muted) px-2 py-1 font-mono text-[10px] text-(--text)">
      {children}
    </code>
  );
}

export default function AgentInterfacePage() {
  return (
    <AppShell>
      <div className="space-y-16">
        <SectionHeading
          eyebrow="read-only MCP contract"
          title="Agent-ready analytics"
          description="A planned interface for domain-aware running questions grounded in governed gold models, typed evidence, and explicit analytical boundaries."
          icon={explorerPages.agentInterface.icon}
        />

        <section className="grid border border-(--border) bg-(--surface) md:grid-cols-[15rem_1fr]">
          <div className="border-b border-(--border) bg-(--surface-muted)/60 p-5 md:border-r md:border-b-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-(--accent)">
              interface_status
            </p>
            <p className="mt-2 font-mono text-xs text-(--signal-ok)">
              contract_design: active
            </p>
            <p className="mt-1 font-mono text-xs text-(--text-soft)">
              production_endpoint: none
            </p>
          </div>
          <p className="max-w-4xl p-5 text-sm leading-7 text-(--text-soft)">
            MCP tools and resource contracts are in active development. No production MCP server or
            endpoint is live. This page defines the intended read-only boundary and does not claim a
            deployed agent runtime, authentication layer, or multi-user serving model.
          </p>
        </section>

        <section>
          <SectionHeading
            eyebrow="01 / Request flow"
            title="The agent interprets; governed models provide the evidence."
            description="Each request follows an explicit path from natural-language intent to approved analytical data and application-owned presentation."
            level={2}
          />
          <ol className="mt-8 grid border-l border-t border-(--border) sm:grid-cols-2 xl:grid-cols-3">
            {interfaceFlow.map((step, index) => (
              <li
                key={step.title}
                className="border-r border-b border-(--border) bg-(--surface)/50 p-5"
              >
                <p className="font-mono text-[10px] text-(--accent)">
                  step::{String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-3 text-base font-medium text-(--text)">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-(--text-soft)">{step.copy}</p>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <SectionHeading
            eyebrow="02 / Domain questions"
            title="Running context shapes the answer."
            description="Bounded tools make common training questions reproducible while keeping metric definitions, time grains, and caveats visible."
            level={2}
          />
          <div className="mt-8 grid border-l border-t border-(--border) md:grid-cols-2">
            {queryExamples.map((example, index) => (
              <article
                key={example.title}
                className="border-r border-b border-(--border) bg-(--surface)/50 p-5 md:p-6"
              >
                <div className="flex items-center justify-between gap-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-(--accent)">
                    query::{String(index + 1).padStart(2, "0")}
                  </p>
                  <span className="font-mono text-[10px] text-(--text-faint)">
                    {example.title}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-medium leading-7 text-(--text)">
                  “{example.query}”
                </h3>
                <p className="mt-3 text-sm leading-6 text-(--text-soft)">{example.output}</p>
              </article>
            ))}
          </div>
        </section>

        <section>
          <SectionHeading
            eyebrow="03 / MCP surface"
            title="Tools answer questions; resources explain the system."
            description="The highlighted tools and resources are representative examples, not an exhaustive final contract. The interface will remain intentionally bounded as additional approved query paths and context are defined."
            level={2}
          />
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="border border-(--border) bg-(--surface)/50">
              <div className="border-b border-(--border) bg-(--surface-muted)/60 px-5 py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-(--accent)">
                  highlighted_tool_examples
                </p>
              </div>
              <div className="divide-y divide-(--border)">
                {plannedTools.map((tool) => (
                  <article key={tool.name} className="p-5">
                    <CodeLabel>{tool.name}</CodeLabel>
                    <p className="mt-3 text-sm leading-6 text-(--text-soft)">{tool.copy}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="border border-(--border) bg-(--surface)/50">
              <div className="border-b border-(--border) bg-(--surface-muted)/60 px-5 py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-(--accent)">
                  highlighted_resource_examples
                </p>
              </div>
              <div className="divide-y divide-(--border)">
                {plannedResources.map((resource) => (
                  <article key={resource.uri} className="p-5">
                    <CodeLabel>{resource.uri}</CodeLabel>
                    <p className="mt-3 text-sm leading-6 text-(--text-soft)">{resource.copy}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section>
          <SectionHeading
            eyebrow="04 / Response contract"
            title="Return evidence and visualization intent, not UI markup."
            description="The MCP layer returns typed analytical data. The consuming mobile or web application remains responsible for rendering accessible charts, maps, tables, and written analysis."
            level={2}
          />
          <dl className="mt-8 grid border-l border-t border-(--border) md:grid-cols-2 xl:grid-cols-3">
            {responseFields.map((field) => (
              <div
                key={field.name}
                className="border-r border-b border-(--border) bg-(--surface)/50 p-5"
              >
                <dt>
                  <CodeLabel>{field.name}</CodeLabel>
                </dt>
                <dd className="mt-3 text-sm leading-6 text-(--text-soft)">{field.copy}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <SectionHeading
            eyebrow="05 / Trust boundary"
            title="The interface is useful because it is constrained."
            description="Gold models define the approved analytical surface. The contract excludes operations and interpretations that are unsafe, ungoverned, or outside this project’s scope."
            level={2}
          />
          <div className="mt-8 grid border border-(--border) bg-(--surface)/50 lg:grid-cols-[1fr_18rem]">
            <ul className="grid border-b border-(--border) sm:grid-cols-2 lg:border-r lg:border-b-0">
              {boundaries.map((boundary) => (
                <li
                  key={boundary}
                  className="flex gap-3 border-b border-(--border) p-5 text-sm leading-6 text-(--text-soft) last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0"
                >
                  <span className="font-mono text-(--accent)" aria-hidden="true">
                    —
                  </span>
                  <span>{boundary}</span>
                </li>
              ))}
            </ul>
            <div className="p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-(--accent)">
                related_extension
              </p>
              <p className="mt-3 text-sm leading-6 text-(--text-soft)">
                Validated offline findings may improve future gold metrics and the context available
                to these tools. Experimental outputs are never served directly.
              </p>
              <Link
                href="/ml-readiness"
                className="mt-5 inline-flex items-center gap-2 font-mono text-xs font-medium uppercase tracking-[0.08em] text-(--accent) hover:text-(--accent-strong)"
              >
                Review ML readiness
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
