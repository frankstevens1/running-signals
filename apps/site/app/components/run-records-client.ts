"use client";

import { useEffect, useState } from "react";

import type { ActivityRecord } from "@/app/lib/types";

const recordCache = new Map<string, ActivityRecord[]>();
const requestCache = new Map<string, Promise<ActivityRecord[]>>();

async function fetchRunRecords(runId: string): Promise<ActivityRecord[]> {
  const existing = recordCache.get(runId);
  if (existing) return existing;

  const inFlight = requestCache.get(runId);
  if (inFlight) return inFlight;

  const request = fetch(`/api/runs/${encodeURIComponent(runId)}/records`, {
    cache: "force-cache",
  })
    .then(async (response) => {
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `Failed to load activity records (${response.status}).`);
      }
      return (await response.json()) as ActivityRecord[];
    })
    .then((records) => {
      recordCache.set(runId, records);
      requestCache.delete(runId);
      return records;
    })
    .catch((error) => {
      requestCache.delete(runId);
      throw error;
    });

  requestCache.set(runId, request);
  return request;
}

export function useRunRecords(runId: string, enabled: boolean) {
  const cachedRecords = recordCache.get(runId) ?? null;
  const [fetched, setFetched] = useState<{ runId: string; records: ActivityRecord[] } | null>(null);
  const [errorState, setErrorState] = useState<{ runId: string; message: string } | null>(null);

  useEffect(() => {
    if (!enabled || cachedRecords) return;
    let cancelled = false;

    fetchRunRecords(runId)
      .then((records) => {
        if (cancelled) return;
        setFetched({ runId, records });
        setErrorState(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorState({
          runId,
          message: error instanceof Error ? error.message : "Failed to load activity records.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [cachedRecords, enabled, runId]);

  const records = cachedRecords ?? (fetched?.runId === runId ? fetched.records : null);
  const error = errorState?.runId === runId ? errorState.message : null;
  return { records, error, isLoading: enabled && !records && error === null };
}
