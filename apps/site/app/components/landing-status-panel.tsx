"use client";

import { AlertTriangle, CheckCircle2, LoaderCircle, Terminal } from "lucide-react";
import { useEffect, useState } from "react";

import { ConsoleStatusIndicator } from "@/app/components/console-primitives";
import { formatDate } from "@/app/lib/format";
import type { LandingStatus } from "@/app/lib/types";

type StatusState =
  | { status: "loading" }
  | { status: "ok"; data: LandingStatus }
  | { status: "error"; message: string };

const pipelineFacts = [
  ["source", "Garmin Connect"],
  ["storage", "S3 + Delta Lake"],
  ["transform", "dbt + SQL"],
  ["serving", "Supabase + Next.js"],
] as const;

function errorMessageFromPayload(payload: unknown): string | null {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  return null;
}

function landingStatusFromPayload(payload: unknown): LandingStatus | null {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "latestCompletedDate" in payload &&
    (typeof payload.latestCompletedDate === "string" || payload.latestCompletedDate === null) &&
    "statusLabel" in payload &&
    typeof payload.statusLabel === "string"
  ) {
    return {
      latestCompletedDate: payload.latestCompletedDate,
      statusLabel: payload.statusLabel,
      goldSchema:
        "goldSchema" in payload && typeof payload.goldSchema === "string"
          ? payload.goldSchema
          : null,
    };
  }

  return null;
}

export function LandingStatusPanel() {
  const [state, setState] = useState<StatusState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function loadStatus() {
      try {
        const response = await fetch("/api/status", {
          signal: controller.signal,
        });
        const payload: unknown = await response.json();

        if (!response.ok) {
          setState({
            status: "error",
            message: errorMessageFromPayload(payload) ?? "Unable to check gold mart status.",
          });
          return;
        }

        const data = landingStatusFromPayload(payload);

        if (data === null) {
          setState({
            status: "error",
            message: "Gold mart status returned an unexpected response.",
          });
          return;
        }

        setState({ status: "ok", data });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Unable to check gold mart status.",
        });
      }
    }

    void loadStatus();

    return () => {
      controller.abort();
    };
  }, []);

  const status =
    state.status === "loading"
      ? {
          label: "querying",
          tone: "neutral" as const,
          icon: (
            <LoaderCircle
              className="h-4 w-4 text-(--text-faint) motion-safe:animate-spin"
              aria-hidden="true"
            />
          ),
          title: "Checking pipeline status",
          description: "Loading the latest completed day.",
        }
      : state.status === "error"
        ? {
            label: "unavailable",
            tone: "warning" as const,
            icon: (
              <AlertTriangle className="h-4 w-4 text-(--signal-warn)" aria-hidden="true" />
            ),
            title: "Pipeline status unavailable",
            description: state.message,
          }
        : state.data.latestCompletedDate === null
          ? {
              label: "no data",
              tone: "warning" as const,
              icon: (
                <AlertTriangle className="h-4 w-4 text-(--signal-warn)" aria-hidden="true" />
              ),
              title: state.data.statusLabel,
              description: "No completed day has been published yet.",
            }
          : {
              label: "available",
              tone: "active" as const,
              icon: (
                <CheckCircle2 className="h-4 w-4 text-(--signal-ok)" aria-hidden="true" />
              ),
              title: state.data.statusLabel,
              description: `Latest completed day: ${formatDate(state.data.latestCompletedDate)}.`,
            };

  return (
    <aside className="border border-(--border) bg-(--surface)" aria-label="Pipeline status">
      <div className="flex items-center justify-between gap-4 border-b border-(--border) bg-(--surface-muted)/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-(--accent)" aria-hidden="true" />
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-(--text)">
            pipeline.status
          </p>
        </div>
        <ConsoleStatusIndicator label={status.label} tone={status.tone} />
      </div>

      <div className="grid grid-cols-2 border-b border-(--border)">
        {pipelineFacts.map(([label, value]) => (
          <div
            key={label}
            className="border-r border-b border-(--border) px-4 py-3 even:border-r-0 nth-[3]:border-b-0 nth-[4]:border-b-0"
          >
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-(--text-soft)">
              {label}
            </p>
            <p className="mt-1 text-xs text-(--text)">{value}</p>
          </div>
        ))}
      </div>

      <div className="px-4 py-4" role="status" aria-live="polite" aria-atomic="true">
        <p className="flex items-center gap-2 text-sm font-semibold text-(--text)">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center">
            {status.icon}
          </span>
          <span>{status.title}</span>
        </p>
        <p className="mt-1 pl-6 text-xs leading-5 text-(--text-soft)">{status.description}</p>
      </div>
    </aside>
  );
}
