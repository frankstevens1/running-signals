import Link from "next/link";
import { Globe, Mail } from "lucide-react";
import { siGithub, siStrava } from "simple-icons";
import { Suspense } from "react";

import { AnalyticsWindowSelector } from "@/app/components/analytics-window-selector";
import { AppNav } from "@/app/components/app-nav";
import { CommandPalette } from "@/app/components/command-palette";
import { DistanceUnitToggle } from "@/app/components/distance-unit-toggle";
import { ThemeToggle } from "@/app/components/theme-toggle";
import { getLandingStatus } from "@/app/lib/data";
import { formatSnapshotFreshness, formatSyncDate } from "@/app/lib/format";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const status = await getLandingStatus();
  const publishedSnapshot = status.status === "ok" ? status.data.lastSyncDate : null;
  const freshnessLabel = formatSnapshotFreshness(publishedSnapshot);
  const snapshotLabel = publishedSnapshot
    ? `snapshot ${formatSyncDate(publishedSnapshot)}`
    : "snapshot unavailable";

  return (
    <div className="flex min-h-screen flex-col bg-(--background) text-(--text)">
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[100] -translate-y-20 border border-(--accent) bg-(--surface) px-3 py-2 font-mono text-xs text-(--accent) transition-transform focus:translate-y-0"
      >
        Skip to content
      </a>

      <header
        data-app-header
        className="sticky top-0 z-40 border-b border-(--border) bg-(--background)/94 shadow-[var(--shadow-header)] backdrop-blur-md"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex min-h-16 items-center justify-between gap-4 py-2.5">
            <div className="flex min-w-0 items-center gap-4">
              <Link href="/" aria-label="Running Signals overview" className="group min-w-0">
                <span className="flex items-center gap-1.5 font-mono text-xs font-medium uppercase tracking-[0.14em] text-(--accent)">
                  <span aria-hidden="true" className="text-(--text-faint)">
                    ~/
                  </span>
                  running-signals
                  <span
                    aria-hidden="true"
                    className="terminal-cursor inline-block h-3.5 w-1.5 bg-(--accent)"
                  />
                </span>
              </Link>

              <div
                className="hidden items-center gap-2 border-l border-(--border) pl-4 font-mono text-[10px] uppercase tracking-[0.12em] text-(--text-faint) md:flex"
                aria-label={`Published FIT data: ${freshnessLabel}, ${snapshotLabel}`}
              >
                <span
                  className={`status-pulse h-1.5 w-1.5 ${publishedSnapshot ? "bg-(--signal-ok)" : "bg-(--signal-warn)"}`}
                  aria-hidden="true"
                />
                <span className={publishedSnapshot ? "text-(--signal-ok)" : "text-(--signal-warn)"}>
                  {freshnessLabel}
                </span>
                <span className="max-w-72 truncate">/ {snapshotLabel}</span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <CommandPalette />
              <Suspense fallback={<div className="h-9 w-9 border border-(--border)" />}>
                <AnalyticsWindowSelector />
              </Suspense>
              <DistanceUnitToggle />
              <ThemeToggle />
            </div>
          </div>

          <AppNav />
        </div>
      </header>

      <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        {children}
      </main>

      <footer className="mt-8 border-t border-(--border) bg-(--surface)/78 lg:mt-16">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-(--text-soft)">
              <span className="text-(--accent)" aria-hidden="true">
                rs://
              </span>
              analytics-engineering / {new Date().getUTCFullYear()}
            </p>
          </div>

          <div className="flex flex-nowrap items-center gap-x-3 font-mono text-xs text-(--text-soft) sm:gap-x-5">
            <a
              href="https://github.com/frankstevens1/running-signals"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 transition-colors hover:text-(--accent)"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
                <path d={siGithub.path} />
              </svg>
              <span className="hidden sm:inline">Repository</span>
            </a>
            <a
              href="https://www.strava.com/athletes/142530754"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 transition-colors hover:text-(--accent)"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
                <path d={siStrava.path} />
              </svg>
              <span className="hidden sm:inline">Strava</span>
            </a>
            <a
              href="https://datafluent.one"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 transition-colors hover:text-(--accent)"
            >
              <Globe className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Portfolio</span>
            </a>
            <a
              href="mailto:frank@datafluent.one"
              className="inline-flex items-center gap-2 transition-colors hover:text-(--accent)"
            >
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Contact</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
