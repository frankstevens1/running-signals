"use client";

import { LogOut } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { ThemeToggle } from "./theme-toggle";

export function AuthControls() {
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/unlock");
    router.refresh();
  };

  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
      {pathname !== "/unlock" ? (
        <button
          type="button"
          aria-label="Log out"
          title="Log out"
          onClick={logout}
          className="inline-flex h-9 w-9 items-center justify-center border border-border bg-surface-muted text-text-soft transition-colors hover:border-border-strong hover:bg-surface-raised hover:text-accent"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
      <ThemeToggle />
    </div>
  );
}
