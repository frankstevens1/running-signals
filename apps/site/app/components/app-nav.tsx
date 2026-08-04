"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, House } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scrollLockRef = useRef<{
    rootOverflow: string;
    bodyOverflow: string;
  } | null>(null);
  const currentPage = commandPaletteItems.find((item) => isCurrentPage(pathname, item.href));

  const lockScroll = useCallback(() => {
    if (scrollLockRef.current) return;
    const root = document.documentElement;
    const body = document.body;
    scrollLockRef.current = {
      rootOverflow: root.style.overflow,
      bodyOverflow: body.style.overflow,
    };
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
  }, []);

  const releaseScroll = useCallback(() => {
    const prev = scrollLockRef.current;
    if (!prev) return;
    document.documentElement.style.overflow = prev.rootOverflow;
    document.body.style.overflow = prev.bodyOverflow;
    scrollLockRef.current = null;
  }, []);

  const open = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    lockScroll();
  }, [lockScroll]);

  const close = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  useEffect(() => {
    return () => releaseScroll();
  }, [releaseScroll]);

  const handleNavigation = () => {
    close();
  };

  return (
    <nav aria-label="Primary" className="relative -mx-4 sm:-mx-6 lg:mx-0">
      <div className="hidden w-full min-w-0 items-stretch justify-between gap-4 overflow-x-auto border-t border-border lg:flex">
        {navigationGroups.map((group) => (
          <div key={group.label} className="flex shrink-0 items-center gap-1 px-2">
            <span className="mr-1 hidden font-mono text-[9px] uppercase tracking-[0.16em] text-text-faint xl:inline">
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
                      ? "bg-accent-soft text-accent"
                      : "text-text-soft hover:bg-surface-muted hover:text-text"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {item.label}
                  {isCurrent ? (
                    <span className="absolute inset-x-2 bottom-0 h-px bg-accent" aria-hidden="true" />
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div className="lg:hidden">
        <button
          ref={triggerRef}
          type="button"
          onClick={open}
          className="flex h-11 w-full items-center justify-between border-t border-border bg-surface-muted px-3 text-left"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <Menu className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <span className="font-mono text-xs uppercase tracking-[0.12em] text-text-soft">
              Navigate
            </span>
            <span className="truncate text-sm font-medium text-text">
              / {currentPage?.label ?? "Overview"}
            </span>
          </span>
        </button>

        <dialog
          ref={dialogRef}
          onClose={() => {
            releaseScroll();
            triggerRef.current?.focus();
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
          className="m-auto w-[min(42rem,calc(100%-2rem))] overscroll-contain border border-border-strong bg-surface p-0 text-text shadow-(--shadow-dialog) backdrop:bg-black/70 max-h-[calc(100vh-4rem)]"
        >
          <div className="max-h-[calc(100vh-4rem)] overflow-y-auto p-4">
            <div className="mb-3 border border-border bg-background">
              <div className="flex items-center gap-2 border-b border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
                <House className="h-3.5 w-3.5" aria-hidden="true" />
                Overview
              </div>
              <div className="p-1">
                <Link
                  href="/"
                  aria-current={pathname === "/" ? "page" : undefined}
                  onClick={handleNavigation}
                  className={`flex items-center gap-3 px-2 py-2.5 text-sm transition-colors ${
                    pathname === "/"
                      ? "bg-accent-soft text-accent"
                      : "text-text-soft hover:bg-surface-muted hover:text-text"
                  }`}
                >
                  <House className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block font-medium">Overview</span>
                    <span className="mt-0.5 hidden truncate text-xs text-text-faint sm:block">
                      Project context, current signals, and pipeline architecture.
                    </span>
                  </span>
                </Link>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {navigationGroups.map((group) => {
                const GroupIcon = group.icon;

                return (
                  <div key={group.label} className="border border-border bg-background">
                    <div className="flex items-center gap-2 border-b border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
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
                                ? "bg-accent-soft text-accent"
                                : "text-text-soft hover:bg-surface-muted hover:text-text"
                            }`}
                          >
                            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span className="min-w-0">
                              <span className="block font-medium">{item.label}</span>
                              <span className="mt-0.5 hidden truncate text-xs text-text-faint sm:block">
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
        </dialog>
      </div>

    </nav>
  );
}
