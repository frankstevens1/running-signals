import { BookOpen } from "lucide-react";
import { AppShell } from "@/app/components/app-shell";
import { SectionHeading } from "@/app/components/section-heading";
import { CodeBlock } from "./code-block";
import { LearnClient } from "./learn-client";
import { curriculum, totalSteps } from "./content/curriculum";

export default async function LearnPage() {
  const steps = await Promise.all(
    curriculum.map(async (step) => ({
      ...step,
      codeBlock: <CodeBlock code={step.sql} lang={step.codeLang} />,
    })),
  );

  return (
    <AppShell>
      <div className="space-y-10">
        <div className="mx-auto max-w-7xl space-y-10 px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="learning"
            title="Model Walkthrough"
            description="Walk through every dbt model in the project — from bronze sources to gold presentation marts — with annotated SQL and explanations of key techniques."
            icon={BookOpen}
          />

          <section className="grid border border-border bg-surface md:grid-cols-[15rem_1fr]">
            <div className="border-b border-border bg-surface-muted/60 p-5 md:border-r md:border-b-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                Curriculum
              </p>
              <p className="mt-2 font-mono text-xs text-text">
                {totalSteps} steps
              </p>
              <p className="mt-1 font-mono text-xs text-text-faint">7 modules</p>
              <p className="mt-1 font-mono text-xs text-text-faint">24 models</p>
            </div>
            <p className="max-w-4xl p-5 text-sm leading-7 text-text-soft">
              Each step pairs the actual SQL from the dbt model with a narrative
              explanation covering what the model does, key SQL patterns it
              demonstrates, and where it fits in the overall data lineage.
              Progress is saved in your browser — pick up where you left off
              anytime. Use arrow keys or the buttons below to navigate.
            </p>
          </section>
        </div>

        <LearnClient steps={steps} totalSteps={totalSteps} />
      </div>
    </AppShell>
  );
}
