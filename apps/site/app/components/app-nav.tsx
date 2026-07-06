"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type MouseEvent } from "react";

import { explorerNavItems } from "@/app/lib/page-metadata";

function isModifiedNavigation(event: MouseEvent<HTMLAnchorElement>) {
  return (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.altKey ||
    event.ctrlKey ||
    event.shiftKey
  );
}

export function AppNav() {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const isPending = pendingHref !== null && pendingHref !== pathname;
  const highlightedHref = isPending ? pendingHref : pathname;

  return (
    <>
      <nav
        aria-label="Primary"
        className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-md border border-(--border) bg-(--surface-muted) p-1"
      >
        {explorerNavItems.map((item) => {
          const Icon = item.icon;
          const isCurrent = pathname === item.href;
          const isHighlighted = highlightedHref === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isCurrent ? "page" : undefined}
              onClick={(event) => {
                if (isModifiedNavigation(event) || isCurrent) {
                  return;
                }

                setPendingHref(item.href);
              }}
              className={`inline-flex h-9 shrink-0 items-center gap-2 rounded px-3 text-sm font-medium transition ${
                isHighlighted
                  ? "bg-(--accent) text-(--accent-foreground) shadow-sm"
                  : "text-(--text-soft) hover:bg-(--surface) hover:text-(--text)"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      {isPending ? (
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-[-1px] h-0.5 overflow-hidden bg-(--accent-soft)"
        >
          <div className="nav-progress-indicator h-full bg-(--accent)" />
        </div>
      ) : null}
    </>
  );
}
