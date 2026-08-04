"use client";

import { useState } from "react";
import Link from "next/link";
import SqlEditor from "@/components/sql-editor";
import ResultsTable from "@/components/results-table";
import { useQueryRunner } from "@/lib/use-query-runner";

const DEFAULT_QUERIES: { label: string; sql: string }[] = [
  {
  label: "List recent runs",
  sql: "SELECT activity_date, distance_km, avg_pace_min_per_km, avg_heart_rate\nFROM site_runs\nORDER BY activity_date DESC\nLIMIT 20",
 },
 {
 label: "Daily totals",
  sql: "SELECT calendar_date, run_count, distance_km, duration_seconds\nFROM site_days\nORDER BY calendar_date DESC\nLIMIT 20",
 },
 {
 label: "Weekly summary",
  sql: "SELECT week_start_date, weekly_distance_km, runs_per_week, avg_pace_min_per_km\nFROM site_weeks\nORDER BY week_start_date DESC\nLIMIT 10",
 },
 {
 label: "Route stats",
  sql: "SELECT route_id, run_count, avg_distance_km, avg_pace_min_per_km, avg_heart_rate\nFROM site_routes\nORDER BY run_count DESC\nLIMIT 10",
 },
];

export default function PlaygroundPage() {
 const { result, error, loading, runQuery, clearResult } = useQueryRunner();
 const [sql, setSql] = useState("");

 return (
 <div className="min-h-screen">
 <div className="max-w-5xl mx-auto px-4 py-12 sm:px-6">
 <header className="mb-8">
 <Link
 href="/"
 className="text-sm text-text-faint hover:text-text-soft transition-colors mb-4 inline-block"
 >
 &larr; Curriculum
 </Link>
 <h1 className="text-2xl font-semibold text-text mb-2">SQL Playground</h1>
  <p className="text-text-soft">Run read-only queries against curated Supabase views.</p>
 </header>

 <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
 <div className="min-w-0 space-y-4">
 <SqlEditor value={sql} onChange={setSql} label="SQL Query" />

 <div className="flex items-center gap-3">
  <button
  onClick={() => runQuery(sql)}
 disabled={loading || !sql.trim()}
 className="px-5 py-1.5 bg-accent text-accent-foreground text-sm font-medium hover:bg-accent-strong disabled:opacity-50 transition-colors"
 >
 {loading ? "Running..." : "Run"}
 </button>

 <button
 onClick={clearResult}
 className="px-3 py-1.5 border border-border text-text-soft text-sm hover:bg-surface-muted transition-colors"
 >
 Clear
 </button>
 </div>

 {error && (
 <div className="p-3 bg-red-900/20 border border-red-900/30 text-signal-error text-sm font-mono whitespace-pre-wrap">
 {error}
 </div>
 )}

 {result && (
 <div className="p-4 border border-border bg-surface">
 <ResultsTable result={result} />
 </div>
 )}

 {!result && !error && !loading && (
 <div className="p-12 text-center text-text-faint text-sm">
 Write a query above and click Run to see results.
 </div>
 )}
 </div>

 <aside className="space-y-4">
 <div className="p-4 border border-border bg-surface">
 <h2 className="text-sm font-medium text-text mb-3">Quick Queries</h2>
 <div className="space-y-2">
 {DEFAULT_QUERIES.map((q) => (
 <button
 key={q.label}
  onClick={() => {
  setSql(q.sql);
  }}
 className="w-full text-left px-3 py-2 border border-border bg-surface-muted hover:border-accent/50 hover:bg-surface-raised text-sm text-text-soft transition-colors"
 >
 {q.label}
 </button>
 ))}
 </div>
 </div>

 <div className="p-4 border border-border bg-surface">
 <h2 className="text-sm font-medium text-text mb-3">Available Tables</h2>
 <div className="space-y-2 text-xs text-text-soft">
 <TableHint name="site_runs" desc="Individual running activities" />
 <TableHint name="site_days" desc="Daily aggregations" />
 <TableHint name="site_weeks" desc="Weekly rollups" />
 <TableHint name="site_routes" desc="Route profiles" />
 <TableHint name="site_fitness" desc="Fitness signals" />
 <TableHint name="site_route_segments" desc="Run segments" />
 </div>
 </div>
 </aside>
 </div>
 </div>
 </div>
 );
}

function TableHint({ name, desc }: { name: string; desc: string }) {
 return (
 <div>
 <code className="text-accent font-mono">{name}</code>
 <span className="text-text-faint ml-2">{desc}</span>
 </div>
 );
}
