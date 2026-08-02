"use client";

import type { QueryResult } from "@/lib/types";
import { CheckCircle } from "lucide-react";

interface ResultsTableProps {
  result: QueryResult;
}

export default function ResultsTable({ result }: ResultsTableProps) {
  const hasColumns = result.columns.length > 0;
  const hasRows = result.rows.length > 0;

  return (
    <div className="w-full">
      <div className="mb-2 text-xs text-text-faint flex items-center justify-between">
        <div className="flex items-center gap-2">
          {hasRows && <CheckCircle className="w-3.5 h-3.5 text-signal-ok" />}
          <span>
            {result.rowCount} row{result.rowCount !== 1 ? "s" : ""}
            {result.rowCount > 1000 ? " (showing first 1000)" : ""}
          </span>
        </div>
        <span>{result.durationMs}ms</span>
      </div>

      {!hasColumns && !hasRows && (
        <div className="p-4 bg-surface-muted border border-border/60 text-sm text-text-soft flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-signal-ok" />
          Query executed successfully. No results returned.
        </div>
      )}

      {!hasColumns && hasRows && (
        <div className="p-4 bg-surface-muted border border-border/60 text-sm text-text-soft">
          Query returned {result.rowCount} row{result.rowCount !== 1 ? "s" : ""}{" "}
          with no columns.
        </div>
      )}

      {hasColumns && (
        <div className="w-full overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                {result.columns.map((col) => (
                  <th
                    key={col}
                    className="text-left px-3 py-2 text-text-soft font-medium whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!hasRows && (
                <tr>
                  <td
                    colSpan={result.columns.length}
                    className="px-3 py-8 text-center text-text-faint text-sm"
                  >
                    No rows match this query.
                  </td>
                </tr>
              )}
              {result.rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-border/40 hover:bg-surface-muted/50 transition-colors"
                >
                  {result.columns.map((col) => (
                    <td
                      key={col}
                      className="px-3 py-1.5 text-text font-mono text-xs whitespace-nowrap max-w-[320px] truncate"
                      title={String(row[col] ?? "NULL")}
                    >
                      {formatCellValue(row[col])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(2);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
