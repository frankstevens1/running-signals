import type { RunView } from "@/app/lib/query";

import { SkeletonBlock } from "./skeleton-block";

const TABLE_COLUMNS = ["w-16", "w-14", "w-14", "w-12", "w-20", "w-16", "w-20", "w-12", "w-14", "w-12"];

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
              <div className="hidden gap-4 border-b border-border p-4 lg:grid md:grid-cols-[12rem_minmax(0,1fr)_auto] xl:grid-cols-[14rem_minmax(0,1fr)_auto]">
                <div className="space-y-3">
                  <SkeletonBlock className="h-2.5 w-24" />
                  <SkeletonBlock className="h-7 w-20" />
                  <SkeletonBlock className="h-3 w-28" />
                </div>
                <div className="grid grid-cols-4 gap-x-6 gap-y-3 self-center">
                  {Array.from({ length: 4 }).map((_, metricIndex) => (
                    <div key={metricIndex} className="space-y-2">
                      <SkeletonBlock className="h-2 w-10" />
                      <SkeletonBlock className="h-4 w-14" />
                    </div>
                  ))}
                </div>
                <SkeletonBlock className="h-9 w-16" />
              </div>
              <div className="border-b border-border p-4 lg:hidden">
                <div className="flex justify-between gap-3">
                  <div className="space-y-3">
                    <SkeletonBlock className="h-2.5 w-24" />
                    <SkeletonBlock className="h-7 w-20" />
                    <SkeletonBlock className="h-3 w-28" />
                  </div>
                  <SkeletonBlock className="h-9 w-16" />
                </div>
                <div className="mt-4 grid grid-cols-4 gap-x-2 gap-y-3 sm:gap-x-6">
                  {Array.from({ length: 4 }).map((_, metricIndex) => (
                    <div key={metricIndex} className="space-y-2">
                      <SkeletonBlock className="h-2 w-9" />
                      <SkeletonBlock className="h-4 w-12" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-x-4 gap-y-3 p-4 sm:gap-x-5 lg:grid-cols-6">
                {Array.from({ length: 6 }).map((_, metricIndex) => (
                  <div key={metricIndex} className="space-y-2">
                    <SkeletonBlock className="h-2 w-12" />
                    <SkeletonBlock className="h-4 w-16" />
                  </div>
                ))}
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
