export function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`border border-(--border) bg-(--surface-muted) motion-safe:animate-pulse ${className}`}
      aria-hidden="true"
    />
  );
}
