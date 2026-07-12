"use client";

import { useEffect, useState } from "react";

import type { DistanceUnit, SegmentResolution } from "@/app/lib/distance-unit";
import type { RunSegment } from "@/app/lib/types";

const segmentCache = new Map<string, RunSegment[]>();
const segmentRequestCache = new Map<string, Promise<RunSegment[]>>();

function cacheKey(runId: string, unit: DistanceUnit, resolution: SegmentResolution) {
  return `${runId}:${unit}:${resolution}`;
}

async function fetchRunSegments(
  runId: string,
  unit: DistanceUnit,
  resolution: SegmentResolution,
): Promise<RunSegment[]> {
  const key = cacheKey(runId, unit, resolution);
  const existing = segmentCache.get(key);

  if (existing) {
    return existing;
  }

  const inFlight = segmentRequestCache.get(key);

  if (inFlight) {
    return inFlight;
  }

  const request = fetch(
    `/api/runs/${encodeURIComponent(runId)}/segments?unit=${unit}&resolution=${resolution}`,
    {
      cache: "force-cache",
    },
  )
    .then(async (response) => {
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `Failed to load run segments (${response.status}).`);
      }

      return (await response.json()) as RunSegment[];
    })
    .then((segments) => {
      segmentCache.set(key, segments);
      segmentRequestCache.delete(key);
      return segments;
    })
    .catch((error) => {
      segmentRequestCache.delete(key);
      throw error;
    });

  segmentRequestCache.set(key, request);
  return request;
}

export function useRunSegments(
  runId: string,
  unit: DistanceUnit,
  resolution: SegmentResolution,
  enabled: boolean,
) {
  const key = cacheKey(runId, unit, resolution);
  const cachedSegments = segmentCache.get(key) ?? null;
  const [fetched, setFetched] = useState<{ key: string; segments: RunSegment[] } | null>(null);
  const [errorState, setErrorState] = useState<{ key: string; message: string } | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (cachedSegments) {
      return;
    }

    let cancelled = false;

    fetchRunSegments(runId, unit, resolution)
      .then((result) => {
        if (cancelled) return;
        setFetched({ key, segments: result });
        setErrorState(null);
      })
      .catch((fetchError: unknown) => {
        if (cancelled) return;
        setErrorState({
          key,
          message:
            fetchError instanceof Error ? fetchError.message : "Failed to load run segments.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [cachedSegments, enabled, key, resolution, runId, unit]);

  const segments = cachedSegments ?? (fetched?.key === key ? fetched.segments : null);
  const error = errorState?.key === key ? errorState.message : null;
  const isLoading = enabled && !segments && error === null;

  return { segments, isLoading, error };
}
