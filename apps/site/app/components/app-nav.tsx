"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { commandPaletteItems, navigationGroups } from "@/app/lib/page-metadata";

function isCurrentPage(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  if (href.includes("#")) {
    return false;
  }

  return pathname === href;
}

export function AppNav() {
  const pathname = usePathname();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const currentPage = commandPaletteItems.find((item) => isCurrentPage(pathname, item.href));

  useEffect(() => {
    if (!isMobileOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      setIsMobileOpen(false);
      menuButtonRef.current?.focus();
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isMobileOpen]);

  const handleNavigation = () => {
    setIsMobileOpen(false);
  };

  return (
    <nav aria-label="Primary" className="relative">
      <div className="hidden w-full min-w-0 items-stretch justify-between gap-4 overflow-x-auto border-t border-(--border) lg:flex">
        {navigationGroups.map((group) => (
          <div key={group.label} className="flex shrink-0 items-center gap-1 px-2">
            <span className="mr-1 hidden font-mono text-[9px] uppercase tracking-[0.16em] text-(--text-faint) xl:inline">
              {group.label}
            </span>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isCurrent = isCurrentPage(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isCurrent ? "page" : undefined}
                  onClick={handleNavigation}
                  className={`group relative inline-flex h-10 shrink-0 items-center gap-2 px-2.5 font-mono text-[11px] transition-colors ${
                    isCurrent
                      ? "bg-(--accent-soft) text-(--accent)"
                      : "text-(--text-soft) hover:bg-(--surface-muted) hover:text-(--text)"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {item.label}
                  {isCurrent ? (
                    <span className="absolute inset-x-2 bottom-0 h-px bg-(--accent)" aria-hidden="true" />
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div className="lg:hidden">
        <button
          ref={menuButtonRef}
          type="button"
          aria-expanded={isMobileOpen}
          aria-controls="mobile-primary-navigation"
          onClick={() => setIsMobileOpen((current) => !current)}
          className="flex h-11 w-full items-center justify-between border-t border-(--border) bg-(--surface-muted) px-3 text-left"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            {isMobileOpen ? (
              <X className="h-4 w-4 shrink-0 text-(--accent)" aria-hidden="true" />
            ) : (
              <Menu className="h-4 w-4 shrink-0 text-(--accent)" aria-hidden="true" />
            )}
            <span className="font-mono text-xs uppercase tracking-[0.12em] text-(--text-soft)">
              Navigate
            </span>
            <span className="truncate text-sm font-medium text-(--text)">
              / {currentPage?.label ?? "Overview"}
            </span>
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-(--text-soft) transition-transform ${
              isMobileOpen ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        </button>

        {isMobileOpen ? (
          <div
            id="mobile-primary-navigation"
            className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-50 max-h-[calc(100vh-10rem)] overflow-y-auto border border-(--border-strong) bg-(--surface) p-2 shadow-[var(--shadow-dialog)]"
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {navigationGroups.map((group) => {
                const GroupIcon = group.icon;

                return (
                  <div key={group.label} className="border border-(--border) bg-(--background)">
                    <div className="flex items-center gap-2 border-b border-(--border) px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-(--text-faint)">
                      <GroupIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      {group.label}
                    </div>
                    <div className="p-1">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const isCurrent = isCurrentPage(pathname, item.href);

                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            aria-current={isCurrent ? "page" : undefined}
                            onClick={handleNavigation}
                            className={`flex items-center gap-3 px-2 py-2.5 text-sm transition-colors ${
                              isCurrent
                                ? "bg-(--accent-soft) text-(--accent)"
                                : "text-(--text-soft) hover:bg-(--surface-muted) hover:text-(--text)"
                            }`}
                          >
                            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span className="min-w-0">
                              <span className="block font-medium">{item.label}</span>
                              <span className="mt-0.5 block truncate text-xs text-(--text-faint)">
                                {item.description}
                              </span>
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

    </nav>
  );
}
