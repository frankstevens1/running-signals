import { AppShell } from "@/app/components/app-shell";
import { ConsoleLabel, ConsolePanel } from "@/app/components/console-primitives";

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`border border-(--border) bg-(--surface-muted) motion-safe:animate-pulse ${className}`}
      aria-hidden="true"
    />
  );
}

export function PageLoadingState({
  title = "Loading live explorer",
  rows = 6,
}: {
  title?: string;
  rows?: number;
}) {
  return (
    <AppShell>
      <div className="space-y-6" role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">{title}</span>
        <div className="max-w-3xl space-y-3">
          <div className="flex items-center gap-2">
            <span className="h-px w-6 bg-(--accent)" aria-hidden="true" />
            <SkeletonBlock className="h-3 w-36" />
          </div>
          <SkeletonBlock className="h-10 w-80 max-w-full" />
          <SkeletonBlock className="h-5 w-full max-w-2xl" />
        </div>
        <ConsolePanel>
          <div className="flex items-center justify-between gap-4 border-b border-(--border) bg-(--surface-muted) px-4 py-2.5">
            <ConsoleLabel>request_status</ConsoleLabel>
            <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wide text-(--text-soft)">
              <span
                className="h-1.5 w-1.5 bg-(--accent) motion-safe:animate-pulse"
                aria-hidden="true"
              />
              Loading
            </span>
          </div>
          <div className="p-4">
            <p className="font-mono text-sm font-medium text-(--text)">{title}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <SkeletonBlock className="h-24" />
              <SkeletonBlock className="h-24" />
              <SkeletonBlock className="h-24" />
            </div>
          </div>
        </ConsolePanel>
        <ConsolePanel>
          <div className="border-b border-(--border) px-4 py-2.5">
            <ConsoleLabel>modeled_rows</ConsoleLabel>
          </div>
          <div className="space-y-2 p-4">
            {Array.from({ length: rows }).map((_, index) => (
              <SkeletonBlock key={index} className="h-9" />
            ))}
          </div>
        </ConsolePanel>
      </div>
    </AppShell>
  );
}
