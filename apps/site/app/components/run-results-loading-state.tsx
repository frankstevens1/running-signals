import type { RunView } from "@/app/lib/query";

import { SkeletonBlock } from "./skeleton-block";

const TABLE_COLUMNS = ["w-16", "w-14", "w-14", "w-12", "w-20", "w-16", "w-20", "w-20", "w-12", "w-16"];

function RunTableLoadingState({ itemCount }: { itemCount: number }) {
  return (
    <div className="overflow-x-auto border border-border bg-surface">
      <table className="min-w-full divide-y divide-border" aria-hidden="true">
        <thead className="border-b border-border bg-surface-muted">
          <tr>
            {TABLE_COLUMNS.map((width, index) => (
              <th key={index} className="px-3 py-2.5">
                <SkeletonBlock className={`h-2.5 ${width}`} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {Array.from({ length: Math.max(itemCount, 8) }).map((_, rowIndex) => (
            <tr key={rowIndex}>
              {TABLE_COLUMNS.map((width, columnIndex) => (
                <td key={columnIndex} className="px-4 py-3">
                  <SkeletonBlock className={`h-3 ${width}`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RunTimelineLoadingState({ itemCount }: { itemCount: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: Math.max(itemCount, 3) }).map((_, index) => (
        <article
          key={index}
          className="-mt-px overflow-hidden border border-border bg-surface first:mt-0"
        >
          <div className="grid lg:grid-cols-[20rem_1fr]">
            <SkeletonBlock className="h-56 border-0 border-b lg:h-full lg:min-h-56 lg:border-r lg:border-b-0" />
            <div className="min-w-0">
              <div className="p-4">
                <div className="flex justify-between gap-3">
                  <div className="space-y-3">
                    <SkeletonBlock className="h-2.5 w-24" />
                    <SkeletonBlock className="h-7 w-20" />
                    <SkeletonBlock className="h-3 w-28" />
                  </div>
                  <SkeletonBlock className="h-9 w-16" />
                </div>
                <div className="mt-6">
                  <div className="grid grid-cols-4 gap-x-3 border-b border-border pb-5 sm:grid-cols-5 sm:gap-x-0">
                    {Array.from({ length: 5 }).map((_, metricIndex) => (
                      <div
                        key={metricIndex}
                        className={`space-y-3 last:col-span-2 sm:last:col-span-1 sm:border-l sm:border-border sm:px-5 first:sm:border-l-0 first:sm:pl-0 ${metricIndex === 4 ? "hidden sm:block" : ""}`}
                      >
                        <SkeletonBlock className="h-2.5 w-14 sm:h-3 sm:w-20" />
                        <SkeletonBlock className="h-4 w-14 sm:h-6 sm:w-20" />
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-x-5 gap-y-6 pt-5 sm:grid-cols-4 sm:gap-x-0">
                    <div className="space-y-3 sm:pr-5">
                      <SkeletonBlock className="h-2 w-24" />
                      <SkeletonBlock className="h-6 w-16" />
                      <SkeletonBlock className="h-3 w-32" />
                    </div>
                    {Array.from({ length: 3 }).map((_, metricIndex) => (
                      <div key={metricIndex} className="space-y-3 sm:border-l sm:border-border sm:px-5">
                        <SkeletonBlock className="h-2 w-16" />
                        <SkeletonBlock className="h-6 w-14" />
                        <SkeletonBlock className="h-3 w-20" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export function RunResultsLoadingState({ view, itemCount }: { view: RunView; itemCount: number }) {
  return view === "table"
    ? <RunTableLoadingState itemCount={itemCount} />
    : <RunTimelineLoadingState itemCount={itemCount} />;
}
