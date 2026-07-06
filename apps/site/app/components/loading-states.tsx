import { AppShell } from "@/app/components/app-shell";

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md border border-(--border) bg-(--surface-muted) ${className}`}
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
      <div className="space-y-6">
        <div className="max-w-3xl space-y-3">
          <SkeletonBlock className="h-4 w-36" />
          <SkeletonBlock className="h-10 w-80 max-w-full" />
          <SkeletonBlock className="h-5 w-full max-w-2xl" />
        </div>
        <div className="rounded-md border border-(--border) bg-(--surface) p-4">
          <p className="text-sm font-semibold text-(--text)">{title}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <SkeletonBlock className="h-24" />
            <SkeletonBlock className="h-24" />
            <SkeletonBlock className="h-24" />
          </div>
        </div>
        <div className="rounded-md border border-(--border) bg-(--surface) p-4">
          <div className="space-y-3">
            {Array.from({ length: rows }).map((_, index) => (
              <SkeletonBlock key={index} className="h-10" />
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
