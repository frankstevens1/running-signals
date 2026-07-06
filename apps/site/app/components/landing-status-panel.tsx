"use client";

import { AlertTriangle, CheckCircle2, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { formatDate } from "@/app/lib/format";
import type { LandingStatus } from "@/app/lib/types";

type StatusState =
  | { status: "loading" }
  | { status: "ok"; data: LandingStatus }
  | { status: "error"; message: string };

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

function StatusCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="min-h-20 rounded-md border border-(--border) bg-(--surface-muted) p-4">
      <div className="flex items-start gap-3">
        {icon}
        <div>
          <p className="text-sm font-semibold text-(--text)">{title}</p>
          <p className="mt-1 text-sm leading-6 text-(--text-soft)">{description}</p>
        </div>
      </div>
    </div>
  );
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

  if (state.status === "loading") {
    return (
      <StatusCard
        icon={
          <LoaderCircle
            className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-(--accent)"
            aria-hidden="true"
          />
        }
        title="Checking modeled outputs"
        description="Loading the latest completed day from the gold signal marts."
      />
    );
  }

  if (state.status === "error") {
    return (
      <StatusCard
        icon={
          <AlertTriangle
            className="mt-0.5 h-5 w-5 shrink-0 text-(--signal-warn)"
            aria-hidden="true"
          />
        }
        title="Status unavailable"
        description={state.message}
      />
    );
  }

  return (
    <StatusCard
      icon={
        <CheckCircle2
          className="mt-0.5 h-5 w-5 shrink-0 text-(--signal-ok)"
          aria-hidden="true"
        />
      }
      title={state.data.statusLabel}
      description={`Latest completed day: ${formatDate(state.data.latestCompletedDate)}.`}
    />
  );
}
