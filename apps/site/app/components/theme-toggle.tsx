"use client";

import { Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";

const themeStorageKey = "running-signals-theme";
const themeCookieMaxAgeSeconds = 60 * 60 * 24 * 365;

function getCurrentTheme(): Theme {
  const attr = document.documentElement.dataset.theme;

  if (attr === "light" || attr === "dark") {
    return attr;
  }

  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeToggle() {
  const toggleTheme = () => {
    const nextTheme = getCurrentTheme() === "light" ? "dark" : "light";

    applyTheme(nextTheme);

    try {
      window.localStorage.setItem(themeStorageKey, nextTheme);
    } catch {
      // Theme persistence is a progressive enhancement.
    }

    document.cookie = `${themeStorageKey}=${nextTheme}; path=/; max-age=${themeCookieMaxAgeSeconds}; samesite=lax`;
  };

  return (
    <button
      type="button"
      aria-label="Toggle color theme"
      title="Toggle theme"
      onClick={toggleTheme}
      className="theme-toggle inline-flex min-h-11 w-11 shrink-0 items-center justify-center rounded-md border border-(--border) bg-(--surface-muted) text-(--text-soft) transition hover:bg-(--surface) hover:text-(--text)"
    >
      <Sun className="theme-icon-sun h-4 w-4" aria-hidden="true" />
      <Moon className="theme-icon-moon h-4 w-4" aria-hidden="true" />
    </button>
  );
}
