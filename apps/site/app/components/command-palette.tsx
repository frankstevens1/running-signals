"use client";

import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  CornerDownLeft,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { commandPaletteItems } from "@/app/lib/page-metadata";

function matchesQuery(query: string, searchableText: string) {
  const tokens = query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  return tokens.every((token) => searchableText.includes(token));
}

export function CommandPalette() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const scrollLockRef = useRef<{
    rootOverflow: string;
    rootOverscrollBehavior: string;
    bodyOverflow: string;
    bodyOverscrollBehavior: string;
  } | null>(null);
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    if (!normalizedQuery) {
      return commandPaletteItems;
    }

    return commandPaletteItems.filter((item) =>
      matchesQuery(
        normalizedQuery,
        [item.label, item.group, item.description, ...item.keywords]
          .join(" ")
          .toLocaleLowerCase(),
      ),
    );
  }, [query]);

  const lockPageScroll = useCallback(() => {
    if (scrollLockRef.current) {
      return;
    }

    const root = document.documentElement;
    const body = document.body;

    scrollLockRef.current = {
      rootOverflow: root.style.overflow,
      rootOverscrollBehavior: root.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyOverscrollBehavior: body.style.overscrollBehavior,
    };

    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
  }, []);

  const releasePageScroll = useCallback(() => {
    const previousStyles = scrollLockRef.current;

    if (!previousStyles) {
      return;
    }

    const root = document.documentElement;
    const body = document.body;

    root.style.overflow = previousStyles.rootOverflow;
    root.style.overscrollBehavior = previousStyles.rootOverscrollBehavior;
    body.style.overflow = previousStyles.bodyOverflow;
    body.style.overscrollBehavior = previousStyles.bodyOverscrollBehavior;
    scrollLockRef.current = null;
  }, []);

  const openPalette = useCallback(() => {
    const dialog = dialogRef.current;

    if (!dialog || dialog.open) {
      return;
    }

    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setActiveIndex(0);
    dialog.showModal();
    lockPageScroll();
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [lockPageScroll]);

  const closePalette = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLocaleLowerCase() !== "k") {
        return;
      }

      event.preventDefault();

      if (dialogRef.current?.open) {
        closePalette();
      } else {
        openPalette();
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => {
      window.removeEventListener("keydown", handleShortcut);
      releasePageScroll();
    };
  }, [closePalette, openPalette, releasePageScroll]);

  const selectItem = (href: string) => {
    closePalette();
    router.push(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={openPalette}
        aria-haspopup="dialog"
        className="group inline-flex h-10 items-center gap-2 border border-(--border) bg-(--surface-muted) px-3 font-mono text-xs text-(--text-soft) transition-colors hover:border-(--border-strong) hover:bg-(--surface-raised) hover:text-(--text)"
      >
        <Search className="h-4 w-4 text-(--accent)" aria-hidden="true" />
        <span className="hidden sm:inline">Find a view</span>
        <kbd className="hidden border border-(--border) bg-(--background) px-1.5 py-0.5 text-[10px] text-(--text-soft) md:inline">
          <span aria-hidden="true">⌘</span>
          <span className="sr-only">Command or Control plus</span>K
        </kbd>
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="command-palette-title"
        aria-describedby="command-palette-description"
        onClose={() => {
          releasePageScroll();
          setQuery("");
          returnFocusRef.current?.focus();
          returnFocusRef.current = null;
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closePalette();
          }
        }}
        className="m-auto w-[min(42rem,calc(100%-2rem))] overscroll-contain border border-(--border-strong) bg-(--surface) p-0 text-(--text) shadow-[var(--shadow-dialog)] backdrop:bg-black/70"
      >
        <div className="border-b border-(--border) px-4 py-3 sm:px-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p id="command-palette-title" className="font-mono text-xs uppercase tracking-[0.14em] text-(--accent)">
                Navigation index
              </p>
              <p id="command-palette-description" className="mt-1 text-sm text-(--text-soft)">
                Search signals, explorers, and system documentation.
              </p>
            </div>
            <button
              type="button"
              onClick={closePalette}
              aria-label="Close navigation search"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-(--border) text-(--text-soft) transition-colors hover:bg-(--surface-muted) hover:text-(--text)"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-4 flex items-center gap-3 border border-(--border-strong) bg-(--background) px-3 focus-within:border-(--accent)">
            <Search className="h-4 w-4 shrink-0 text-(--accent)" aria-hidden="true" />
            <label htmlFor="command-palette-input" className="sr-only">
              Search pages
            </label>
            <input
              ref={inputRef}
              id="command-palette-input"
              type="text"
              inputMode="search"
              enterKeyHint="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveIndex((current) =>
                    filteredItems.length === 0 ? 0 : (current + 1) % filteredItems.length,
                  );
                }

                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveIndex((current) =>
                    filteredItems.length === 0
                      ? 0
                      : (current - 1 + filteredItems.length) % filteredItems.length,
                  );
                }

                if (event.key === "Enter" && filteredItems[activeIndex]) {
                  event.preventDefault();
                  selectItem(filteredItems[activeIndex].href);
                }
              }}
              role="combobox"
              aria-expanded="true"
              aria-autocomplete="list"
              aria-controls={listboxId}
              aria-activedescendant={
                filteredItems[activeIndex] ? `${listboxId}-option-${activeIndex}` : undefined
              }
              autoComplete="off"
              placeholder="Type a page, metric, or model layer…"
              className="command-palette-input h-12 min-w-0 flex-1 bg-transparent font-mono text-sm text-(--text) placeholder:text-(--text-faint)"
            />
          </div>
        </div>

        <div
          id={listboxId}
          role="listbox"
          className="max-h-[min(26rem,55vh)] overscroll-contain overflow-y-auto p-2"
        >
          {filteredItems.length > 0 ? (
            filteredItems.map((item, index) => {
              const Icon = item.icon;
              const isActive = index === activeIndex;

              return (
                <button
                  key={item.href}
                  id={`${listboxId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => selectItem(item.href)}
                  className={`flex w-full items-center gap-3 border px-3 py-3 text-left transition-colors ${
                    isActive
                      ? "border-(--accent) bg-(--accent-soft)"
                      : "border-transparent hover:border-(--border) hover:bg-(--surface-muted)"
                  }`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-(--border) bg-(--surface-raised) text-(--accent)">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-(--text)">{item.label}</span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-(--text-faint)">
                        {item.group}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-(--text-soft)">
                      {item.description}
                    </span>
                  </span>
                  <span className="font-mono text-xs text-(--text-faint)" aria-hidden="true">
                    {isActive ? "↵" : item.href}
                  </span>
                </button>
              );
            })
          ) : (
            <div className="px-4 py-10 text-center">
              <p className="font-mono text-sm text-(--text)">No matching view</p>
              <p className="mt-2 text-sm text-(--text-soft)">
                Try a signal name, explorer, or model layer.
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-(--border) px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-(--text-faint) sm:px-5">
          <span className="inline-flex items-center gap-1.5">
            <ArrowUp className="h-3 w-3" aria-hidden="true" />
            <ArrowDown className="h-3 w-3" aria-hidden="true" />
            Navigate
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CornerDownLeft className="h-3 w-3" aria-hidden="true" />
            Open
          </span>
          <span>Esc close</span>
        </div>
      </dialog>
    </>
  );
}
