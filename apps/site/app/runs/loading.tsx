import { PageLoadingState } from "@/app/components/loading-states";

export default function Loading() {
  return <PageLoadingState title="Loading run rows" rows={8} />;
}
