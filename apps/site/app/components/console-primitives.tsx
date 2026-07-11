import type { HTMLAttributes, ReactNode } from "react";

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function ConsolePanel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={joinClasses("border border-(--border) bg-(--surface)", className)}
      {...props}
    />
  );
}

export function ConsoleLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={joinClasses(
        "font-mono text-xs font-medium uppercase tracking-wider text-(--text-soft)",
        className,
      )}
    >
      {children}
    </p>
  );
}

type ConsoleStatusTone = "neutral" | "active" | "warning" | "error";

const statusToneClasses: Record<ConsoleStatusTone, string> = {
  neutral: "bg-(--text-faint)",
  active: "bg-(--signal-ok)",
  warning: "bg-(--signal-warn)",
  error: "bg-(--signal-error)",
};

export function ConsoleStatusIndicator({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: ConsoleStatusTone;
}) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wide text-(--text-soft)">
      <span className={`h-1.5 w-1.5 shrink-0 ${statusToneClasses[tone]}`} aria-hidden="true" />
      {label}
    </span>
  );
}

export function ConsoleStatusPanel({
  label,
  statusLabel,
  tone = "neutral",
  icon,
  title,
  description,
  children,
  className,
  live = false,
}: {
  label: string;
  statusLabel: string;
  tone?: ConsoleStatusTone;
  icon?: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
  className?: string;
  live?: boolean;
}) {
  return (
    <ConsolePanel
      className={joinClasses("overflow-hidden", className)}
      role={live ? "status" : undefined}
      aria-live={live ? "polite" : undefined}
    >
      <div className="flex items-center justify-between gap-4 border-b border-(--border) bg-(--surface-muted) px-4 py-2.5">
        <ConsoleLabel>{label}</ConsoleLabel>
        <ConsoleStatusIndicator label={statusLabel} tone={tone} />
      </div>
      <div className="flex items-start gap-3 p-4">
        {icon ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-(--border) text-(--accent)">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-(--text)">{title}</p>
          <p className="mt-1 text-sm leading-6 text-(--text-soft)">{description}</p>
          {children}
        </div>
      </div>
    </ConsolePanel>
  );
}
