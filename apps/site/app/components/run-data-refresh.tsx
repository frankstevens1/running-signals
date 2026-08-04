"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useEffect,
  useContext,
  useRef,
  useState,
  useTransition,
  type ComponentProps,
  type MouseEventHandler,
  type ReactNode,
} from "react";

import type { RunView } from "@/app/lib/query";

import { RunResultsLoadingState } from "./run-results-loading-state";

const LOADING_DELAY_MS = 150;
const MIN_LOADING_VISIBLE_MS = 200;

type RunDataRefreshContextValue = {
  isPending: boolean;
  pendingView: RunView;
  navigate: (href: string) => void;
};

const RunDataRefreshContext = createContext<RunDataRefreshContextValue | null>(null);

function useRunDataRefresh() {
  const context = useContext(RunDataRefreshContext);
  if (!context) throw new Error("Run data refresh controls must be inside their provider.");
  return context;
}

export function useRunDataRefreshNavigate() {
  const { isPending, navigate } = useRunDataRefresh();
  return { isPending, navigate };
}

function viewFromHref(href: string, fallback: RunView): RunView {
  const view = new URL(href, "https://running-signals.invalid").searchParams.get("view");
  return view === "table" || view === "timeline" ? view : fallback;
}

function useLoadingVisibility(isPending: boolean) {
  const [isVisible, setIsVisible] = useState(false);
  const visibleSince = useRef<number | null>(null);

  useEffect(() => {
    if (!isPending) return;

    const timeout = window.setTimeout(() => {
      visibleSince.current = Date.now();
      setIsVisible(true);
    }, LOADING_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [isPending]);

  useEffect(() => {
    if (isPending || !isVisible) return;

    const elapsed = visibleSince.current === null ? MIN_LOADING_VISIBLE_MS : Date.now() - visibleSince.current;
    const timeout = window.setTimeout(() => {
      visibleSince.current = null;
      setIsVisible(false);
    }, Math.max(MIN_LOADING_VISIBLE_MS - elapsed, 0));

    return () => window.clearTimeout(timeout);
  }, [isPending, isVisible]);

  return isVisible;
}

export function RunDataRefreshProvider({
  children,
  view,
}: {
  children: ReactNode;
  view: RunView;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingView, setPendingView] = useState(view);

  function navigate(href: string) {
    setPendingView(viewFromHref(href, view));
    startTransition(() => router.push(href, { scroll: false }));
  }

  return (
    <RunDataRefreshContext value={{ isPending, pendingView, navigate }}>
      {children}
    </RunDataRefreshContext>
  );
}

export function RunDataRefreshRegion({
  children,
  itemCount,
}: {
  children: ReactNode;
  itemCount: number;
}) {
  const { isPending, pendingView } = useRunDataRefresh();
  const isLoadingVisible = useLoadingVisibility(isPending);

  return (
    <div className="relative mt-4" aria-busy={isPending || isLoadingVisible || undefined}>
      {children}
      {isLoadingVisible ? (
        <div className="absolute inset-0 z-30 overflow-hidden bg-(--surface)/92 backdrop-blur-sm">
          <RunResultsLoadingState view={pendingView} itemCount={itemCount} />
        </div>
      ) : null}
      {isPending ? (
        <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          Refreshing run data...
        </span>
      ) : null}
    </div>
  );
}

type RunDataRefreshLinkProps = Omit<ComponentProps<typeof Link>, "href" | "onClick"> & {
  href: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

export function RunDataRefreshLink({
  href,
  onClick,
  className,
  ...props
}: RunDataRefreshLinkProps) {
  const { isPending, navigate } = useRunDataRefresh();

  function handleClick(event: Parameters<MouseEventHandler<HTMLAnchorElement>>[0]) {
    onClick?.(event);

    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) {
      return;
    }

    event.preventDefault();
    if (!isPending) navigate(href);
  }

  return (
    <Link
      {...props}
      href={href}
      aria-disabled={isPending || undefined}
      onClick={handleClick}
      className={`${className ?? ""}${isPending ? " pointer-events-none opacity-60" : ""}`}
    />
  );
}
