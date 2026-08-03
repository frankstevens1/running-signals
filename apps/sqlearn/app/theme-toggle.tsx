"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "dark" | "light";

const themeStorageKey = "sqlearn-theme";
const themeCookieMaxAgeSeconds = 60 * 60 * 24 * 365;

function getCurrentTheme(): Theme {
  const theme = document.documentElement.dataset.theme;
  if (theme === "dark" || theme === "light") return theme;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    queueMicrotask(() => setTheme(getCurrentTheme()));
  }, []);

  const toggleTheme = () => {
    const nextTheme = getCurrentTheme() === "light" ? "dark" : "light";
    applyTheme(nextTheme);
    setTheme(nextTheme);

    try {
      window.localStorage.setItem(themeStorageKey, nextTheme);
    } catch {
      // Theme persistence is a progressive enhancement.
    }

    document.cookie = `${themeStorageKey}=${nextTheme}; path=/; max-age=${themeCookieMaxAgeSeconds}; samesite=lax`;
  };

  const nextTheme = theme === "light" ? "dark" : "light";

  return (
    <button
      type="button"
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
      onClick={toggleTheme}
      className="inline-flex h-9 w-9 items-center justify-center border border-border bg-surface-muted text-text-soft transition-colors hover:border-border-strong hover:bg-surface-raised hover:text-accent"
    >
      {theme === "light" ? <Moon className="h-4 w-4" aria-hidden="true" /> : <Sun className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}
