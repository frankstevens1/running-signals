import Link from "next/link";
import { AlertTriangle, Database } from "lucide-react";

import { ConsoleStatusPanel } from "@/app/components/console-primitives";
import type { DataResult } from "@/app/lib/types";

export function DataState<T>({
  result,
  children,
}: {
  result: DataResult<T>;
  children: (data: T) => React.ReactNode;
}) {
  if (result.status === "ok") return children(result.data);

  const Icon = result.status === "not_configured" ? Database : AlertTriangle;
  const isNotConfigured = result.status === "not_configured";

  return (
    <ConsoleStatusPanel
      label="data_source"
      statusLabel={isNotConfigured ? "configuration required" : "query failed"}
      tone={isNotConfigured ? "warning" : "error"}
      icon={<Icon className="h-4 w-4" aria-hidden="true" />}
      title={isNotConfigured ? "Databricks is not configured" : "Live data query failed"}
      description={result.message}
      className="max-w-3xl"
    >
      <div className="mt-4 border-t border-(--border) pt-4">
        <p className="font-mono text-xs uppercase tracking-wide text-(--text-soft)">
          Recovery path
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-(--text-soft)">
          The presentation layer still builds without credentials. Configure the server-side
          variables from <code className="font-mono text-(--text)">.env.example</code> to load live
          gold marts.
        </p>
        <Link
          href="/#methodology"
          className="mt-3 inline-flex h-9 items-center border border-(--border) px-3 font-mono text-xs font-medium uppercase tracking-wide text-(--text) transition-colors hover:border-(--accent) hover:bg-(--surface-muted) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
        >
          View methodology
        </Link>
      </div>
    </ConsoleStatusPanel>
  );
}
