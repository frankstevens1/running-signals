import type { ResolvedAnalyticsWindow } from "./analytics-window";
import type { DataResult } from "./types";

export async function windowedResult<T>(
  window: ResolvedAnalyticsWindow,
  primary: Promise<DataResult<T>>,
  comparison: Promise<DataResult<T>> | null,
): Promise<DataResult<{
  primary: T;
  comparison: T | null;
  comparisonError: string | null;
  window: ResolvedAnalyticsWindow;
}>> {
  const [primaryResult, comparisonResult] = await Promise.all([primary, comparison]);
  if (primaryResult.status !== "ok") return primaryResult;
  return {
    status: "ok",
    data: {
      primary: primaryResult.data,
      comparison: comparisonResult?.status === "ok" ? comparisonResult.data : null,
      comparisonError: comparisonResult?.status === "error" ? (comparisonResult.message ?? null) : null,
      window,
    },
  };
}
