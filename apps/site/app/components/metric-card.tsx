import type { LucideIcon } from "lucide-react";

import { ConsoleLabel, ConsolePanel } from "@/app/components/console-primitives";

export function MetricCard({
  label,
  value,
  detail,
  source,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail?: string;
  source?: string;
  icon?: LucideIcon;
}) {
  return (
    <ConsolePanel className="group flex min-h-36 flex-col">
      <dl className="flex flex-1 items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <dt>
            <ConsoleLabel>{label}</ConsoleLabel>
          </dt>
          <dd className="mt-3 font-mono text-2xl font-semibold tabular-nums tracking-tight text-(--text)">
            {value}
          </dd>
        </div>
        {Icon ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-(--border) bg-(--surface-muted) text-(--accent)">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
        ) : null}
      </dl>
      {detail || source ? (
        <div className="grid gap-2 border-t border-(--border) px-4 py-3 text-xs leading-5 text-(--text-soft)">
          {detail ? (
            <p>
              <span className="mr-2 font-mono uppercase tracking-wide text-(--text)">Context</span>
              {detail}
            </p>
          ) : null}
          {source ? (
            <p>
              <span className="mr-2 font-mono uppercase tracking-wide text-(--text)">Source</span>
              {source}
            </p>
          ) : null}
        </div>
      ) : null}
    </ConsolePanel>
  );
}
