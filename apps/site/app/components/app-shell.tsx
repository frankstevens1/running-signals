import Link from "next/link";
import { Mail } from "lucide-react";
import { siGithub } from "simple-icons";

import { AppNav } from "@/app/components/app-nav";
import { ThemeToggle } from "@/app/components/theme-toggle";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-(--background) text-(--text)">
      <header className="sticky top-0 z-30 border-b border-(--border) bg-(--surface)/92 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Link href="/" className="w-fit">
              <span className="block text-sm font-semibold uppercase tracking-normal text-(--accent)">
                Running Signals
              </span>
              <span className="block text-lg font-semibold text-(--text)">
                Garmin to frontend-ready signal marts
              </span>
            </Link>
            <div className="flex min-w-0 items-stretch gap-2 md:max-w-[70%]">
              <AppNav />
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
      <footer className="border-t border-(--border) bg-(--surface)/72">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 text-sm text-(--text-soft) sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p className="flex items-center gap-2">
            <span>2026</span>
            <a
              href="https://datafluent.one"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-(--text) hover:text-(--accent)"
            >
              datafluent
            </a>
          </p>
          <div className="flex items-center gap-2">
            <a
              href="https://github.com/frankstevens1/running-signals"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub repository"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-(--border) text-(--text-soft) hover:bg-(--surface-muted) hover:text-(--text)"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                <path d={siGithub.path} />
              </svg>
            </a>
            <a
              href="mailto:frank@datafluent.one"
              aria-label="Email contact"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-(--border) text-(--text-soft) hover:bg-(--surface-muted) hover:text-(--text)"
            >
              <Mail className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
