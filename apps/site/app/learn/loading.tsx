import { PageLoadingState } from "@/app/components/loading-states";

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <PageLoadingState />
    </div>
  );
}
