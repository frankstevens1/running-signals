import { AppShell } from "@/app/components/app-shell";

function Skeleton({ className }: { className: string }) {
  return (
    <div
      className={`bg-(--surface-muted) motion-safe:animate-pulse ${className}`}
      aria-hidden="true"
    />
  );
}

export default function Loading() {
  return (
    <AppShell>
      <div className="space-y-10" role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Loading routes</span>

        <div className="max-w-3xl space-y-3">
          <Skeleton className="h-3 w-52" />
          <Skeleton className="h-10 w-36" />
          <Skeleton className="h-5 w-full max-w-2xl" />
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.8fr)]">
          <section className="flex flex-col overflow-hidden border border-(--border) bg-(--surface) lg:h-[758px]">
            <div className="border-b border-(--border) px-4 py-3">
              <Skeleton className="h-3 w-36" />
              <Skeleton className="mt-1 h-5 w-28" />
            </div>
            <div className="grid gap-3 border-b border-(--border) bg-(--surface-muted) pb-3 pt-2 px-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
            <Skeleton className="h-[520px] lg:h-[620px]" />
          </section>

          <section className="flex min-h-0 flex-col overflow-hidden border border-(--border) bg-(--surface) lg:h-[758px]">
            <div className="flex items-center justify-between gap-4 border-b border-(--border) px-4 py-3">
              <div>
                <Skeleton className="h-3 w-40" />
                <Skeleton className="mt-1 h-5 w-52" />
              </div>
              <Skeleton className="h-8 w-16" />
            </div>
            <div className="grid grid-cols-2 gap-3 border-b border-(--border) bg-(--surface-muted) pb-3 pt-2 px-4">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-28 border-b border-(--border)" />
              ))}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
