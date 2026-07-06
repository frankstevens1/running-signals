import type { LucideIcon } from "lucide-react";

export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="rounded-md border border-(--border) bg-(--surface) p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-(--text-soft)">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-(--text)">{value}</p>
        </div>
        {Icon ? (
          <div className="rounded-md bg-(--surface-muted) p-2 text-(--accent)">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
        ) : null}
      </div>
      {detail ? <p className="mt-3 text-sm text-(--text-soft)">{detail}</p> : null}
    </div>
  );
}
