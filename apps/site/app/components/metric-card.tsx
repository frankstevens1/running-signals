import type { LucideIcon } from "lucide-react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import { ConsoleLabel, ConsolePanel } from "@/app/components/console-primitives";
import { MarqueeText } from "@/app/components/marquee-text";

export function MetricCard({
  label,
  value,
  detail,
  source,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string;
  detail?: string;
  source?: string;
  icon?: LucideIcon;
  trend?: {
    direction: "up" | "down" | "neutral";
    value: string;
    label: string;
    invert?: boolean;
  };
}) {
  let TrendIcon = Minus;
  let trendColor = "text-(--text-soft)";
  if (trend && trend.direction !== "neutral") {
    const rawUp = trend.direction === "up";
    const up = trend.invert ? !rawUp : rawUp;
    TrendIcon = up ? TrendingUp : TrendingDown;
    trendColor = up ? "text-(--signal-ok)" : "text-(--signal-error)";
  }

  return (
    <ConsolePanel className="group flex min-h-36 min-w-0 flex-col">
      <dl className="flex flex-1 items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <dt>
            <ConsoleLabel>{label}</ConsoleLabel>
          </dt>
          <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums tracking-tight text-(--text)">
            {value}
          </dd>
          {trend ? (
            <dd className={`mt-1 inline-flex items-center gap-1 font-mono text-xs font-normal tracking-normal ${trendColor}`}>
              <TrendIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap">
                {trend.value} {trend.label}
              </span>
            </dd>
          ) : null}
        </div>
        {Icon ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-(--border) bg-(--surface-muted) text-(--accent)">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
        ) : null}
      </dl>
      {detail || source ? (
        <div className="grid gap-1 border-t border-(--border) px-4 py-3 text-xs leading-5 text-(--text-soft)">
          {detail ? (
            <div>
              <span className="font-mono uppercase tracking-wide text-(--text)">Context</span>
              <MarqueeText text={detail} />
            </div>
          ) : null}
          {source ? (
            <div>
              <span className="font-mono uppercase tracking-wide text-(--text)">Source</span>
              <MarqueeText text={source} />
            </div>
          ) : null}
        </div>
      ) : null}
    </ConsolePanel>
  );
}
