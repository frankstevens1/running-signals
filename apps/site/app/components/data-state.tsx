import Link from "next/link";
import { AlertTriangle, Database } from "lucide-react";

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

  return (
    <div className="rounded-md border border-(--border) bg-(--surface) p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-(--surface-muted) p-2 text-(--accent)">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-(--text)">
            {result.status === "not_configured"
              ? "Databricks is not configured"
              : "Live data query failed"}
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-(--text-soft)">{result.message}</p>
          <p className="text-sm text-(--text-soft)">
            The presentation layer still builds without credentials. Configure the server-side
            variables from <code className="font-mono text-(--text)">.env.example</code> to load
            live gold marts.
          </p>
          <Link
            href="/#methodology"
            className="inline-flex h-9 items-center rounded-md border border-(--border) px-3 text-sm font-medium text-(--text) hover:bg-(--surface-muted)"
          >
            View methodology
          </Link>
        </div>
      </div>
    </div>
  );
}
