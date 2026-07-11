import Link from "next/link";
import { ExternalLink, Mail } from "lucide-react";
import { siGithub } from "simple-icons";

import { AppNav } from "@/app/components/app-nav";
import { CommandPalette } from "@/app/components/command-palette";
import { ThemeToggle } from "@/app/components/theme-toggle";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-(--background) text-(--text)">
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[100] -translate-y-20 border border-(--accent) bg-(--surface) px-3 py-2 font-mono text-xs text-(--accent) transition-transform focus:translate-y-0"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-(--border) bg-(--background)/94 shadow-[var(--shadow-header)] backdrop-blur-md">
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
                <span className="mt-1 hidden truncate text-xs text-(--text-soft) sm:block">
                  Garmin data → explainable training signals
                </span>
              </Link>

              <div
                className="hidden items-center gap-2 border-l border-(--border) pl-4 font-mono text-[10px] uppercase tracking-[0.12em] text-(--text-faint) md:flex"
                aria-label="System status: online, gold signal models available"
              >
                <span className="status-pulse h-1.5 w-1.5 bg-(--signal-ok)" aria-hidden="true" />
                <span className="text-(--signal-ok)">online</span>
                <span>/ gold models</span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <CommandPalette />
              <ThemeToggle />
            </div>
          </div>

          <AppNav />
        </div>
      </header>

      <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        {children}
      </main>

      <footer className="mt-16 border-t border-(--border) bg-(--surface)/78">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-(--text-soft)">
              <span className="text-(--accent)" aria-hidden="true">
                rs://
              </span>
              analytics-engineering / 2026
            </p>
            <p className="mt-1.5 text-xs text-(--text-faint)">
              Personal running data, modeled for clarity rather than coaching.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 font-mono text-xs text-(--text-soft)">
            <a
              href="https://github.com/frankstevens1/running-signals"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 transition-colors hover:text-(--accent)"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
                <path d={siGithub.path} />
              </svg>
              Repository
            </a>
            <a
              href="https://datafluent.one"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 transition-colors hover:text-(--accent)"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              Portfolio
            </a>
            <a
              href="mailto:frank@datafluent.one"
              className="inline-flex items-center gap-2 transition-colors hover:text-(--accent)"
            >
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
