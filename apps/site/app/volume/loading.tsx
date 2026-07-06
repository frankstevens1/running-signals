import { PageLoadingState } from "@/app/components/loading-states";

export default function Loading() {
  return <PageLoadingState title="Loading volume rollups" rows={5} />;
}
