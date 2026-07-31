"use client";

import { useEffect, useState } from "react";

import type { MapProfileRecord } from "@/app/lib/types";

const recordCache = new Map<string, MapProfileRecord[]>();
const requestCache = new Map<string, Promise<MapProfileRecord[]>>();

function routeRecordsUrl(routeId: string) {
  return `/api/routes/records?routeId=${encodeURIComponent(routeId)}`;
}

async function fetchRouteRecords(routeId: string): Promise<MapProfileRecord[]> {
  const existing = recordCache.get(routeId);
  if (existing) return existing;

  const inFlight = requestCache.get(routeId);
  if (inFlight) return inFlight;

  const request = fetch(routeRecordsUrl(routeId), { cache: "force-cache" })
    .then(async (response) => {
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `Failed to load route records (${response.status}).`);
      }

      return (await response.json()) as MapProfileRecord[];
    })
    .then((records) => {
      recordCache.set(routeId, records);
      requestCache.delete(routeId);
      return records;
    })
    .catch((error: unknown) => {
      requestCache.delete(routeId);
      throw error;
    });

  requestCache.set(routeId, request);
  return request;
}

export function shouldRequestRouteRecords(
  routeId: string | null,
  hasCachedRecords: boolean,
): routeId is string {
  return routeId !== null && !hasCachedRecords;
}

export function useRouteRecords(routeId: string | null) {
  const cachedRecords = routeId ? recordCache.get(routeId) ?? null : null;
  const [fetched, setFetched] = useState<{
    routeId: string;
    records: MapProfileRecord[];
  } | null>(null);
  const [errorState, setErrorState] = useState<{ routeId: string; message: string } | null>(null);

  useEffect(() => {
    if (!shouldRequestRouteRecords(routeId, cachedRecords !== null)) return;
    let cancelled = false;

    fetchRouteRecords(routeId)
      .then((records) => {
        if (cancelled) return;
        setFetched({ routeId, records });
        setErrorState(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorState({
          routeId,
          message: error instanceof Error ? error.message : "Failed to load route records.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [cachedRecords, routeId]);

  const records =
    cachedRecords ?? (routeId !== null && fetched?.routeId === routeId ? fetched.records : null);
  const error = routeId !== null && errorState?.routeId === routeId ? errorState.message : null;

  return { records, error, isLoading: routeId !== null && !records && error === null };
}
