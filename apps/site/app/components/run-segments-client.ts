"use client";

import { useEffect, useState } from "react";

import type { RouteSegment } from "@/app/lib/types";

const segmentCache = new Map<string, RouteSegment[]>();
const segmentRequestCache = new Map<string, Promise<RouteSegment[]>>();

async function fetchRunSegments(runId: string): Promise<RouteSegment[]> {
  const existing = segmentCache.get(runId);

  if (existing) {
    return existing;
  }

  const inFlight = segmentRequestCache.get(runId);

  if (inFlight) {
    return inFlight;
  }

  const request = fetch(`/api/runs/${encodeURIComponent(runId)}/segments`, {
    cache: "force-cache",
  })
    .then(async (response) => {
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `Failed to load run segments (${response.status}).`);
      }

      return (await response.json()) as RouteSegment[];
    })
    .then((segments) => {
      segmentCache.set(runId, segments);
      segmentRequestCache.delete(runId);
      return segments;
    })
    .catch((error) => {
      segmentRequestCache.delete(runId);
      throw error;
    });

  segmentRequestCache.set(runId, request);
  return request;
}

export function useRunSegments(runId: string, enabled: boolean) {
  const cachedSegments = segmentCache.get(runId) ?? null;
  const [fetched, setFetched] = useState<{ runId: string; segments: RouteSegment[] } | null>(null);
  const [errorState, setErrorState] = useState<{ runId: string; message: string } | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (cachedSegments) {
      return;
    }

    let cancelled = false;

    fetchRunSegments(runId)
      .then((result) => {
        if (cancelled) return;
        setFetched({ runId, segments: result });
        setErrorState(null);
      })
      .catch((fetchError: unknown) => {
        if (cancelled) return;
        setErrorState({
          runId,
          message:
            fetchError instanceof Error ? fetchError.message : "Failed to load run segments.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [cachedSegments, enabled, runId]);

  const segments = cachedSegments ?? (fetched?.runId === runId ? fetched.segments : null);
  const error = errorState?.runId === runId ? errorState.message : null;
  const isLoading = enabled && !segments && error === null;

  return { segments, isLoading, error };
}
