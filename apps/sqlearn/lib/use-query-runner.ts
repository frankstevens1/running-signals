"use client";

import { useState, useCallback } from "react";
import type { QueryResult } from "@/lib/types";

interface UseQueryRunnerReturn {
  result: QueryResult | null;
  error: string | null;
  loading: boolean;
  runQuery: (sql: string) => Promise<void>;
  clearResult: () => void;
}

export function useQueryRunner(): UseQueryRunnerReturn {
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const runQuery = useCallback(async (sql: string) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql }),
      });

      const data = (await response.json()) as QueryResult & { error?: string };

      if (!response.ok || data.error) {
        setError(data.error ?? `HTTP ${response.status}`);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { result, error, loading, runQuery, clearResult };
}
