import type { Metadata } from "next";
import { cookies } from "next/headers";
import Script from "next/script";

import { DistanceUnitProvider } from "@/app/components/distance-unit-provider";
import { DISTANCE_UNIT_STORAGE_KEY } from "@/app/lib/distance-unit";
import { getServerDistanceUnit } from "@/app/lib/server-distance-unit";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Running Signals",
    template: "%s | Running Signals",
  },
  applicationName: "Running Signals",
  description:
    "An analytics engineering project that models personal Garmin data into explainable consistency, volume, and fitness signals.",
  keywords: ["analytics engineering", "Databricks", "dbt", "Garmin", "running data"],
};

const themeStorageKey = "running-signals-theme";

const distanceUnitScript = `
(() => {
  try {
    const storageKey = "${DISTANCE_UNIT_STORAGE_KEY}";
    const savedUnit = window.localStorage.getItem(storageKey);
    const cookieUnit = document.cookie
      .split("; ")
      .find((row) => row.startsWith(storageKey + "="))
      ?.split("=")[1];
    const locale = new Intl.Locale(window.navigator.language);
    const localeUnit = ["LR", "MM", "US"].includes(locale.region || "") ? "mi" : "km";
    const unit = cookieUnit === "km" || cookieUnit === "mi"
      ? cookieUnit
      : savedUnit === "km" || savedUnit === "mi"
        ? savedUnit
        : localeUnit;

    document.documentElement.dataset.distanceUnit = unit;
    window.localStorage.setItem(storageKey, unit);
    document.cookie = storageKey + "=" + unit + "; path=/; max-age=31536000; samesite=lax";
  } catch {
  }
})();
`;

const themeScript = `
(() => {
  try {
    const storageKey = "${themeStorageKey}";
    const savedTheme = window.localStorage.getItem(storageKey);

    if (savedTheme === "light" || savedTheme === "dark") {
      document.documentElement.dataset.theme = savedTheme;
      document.documentElement.style.colorScheme = savedTheme;
      document.cookie = storageKey + "=" + savedTheme + "; path=/; max-age=31536000; samesite=lax";
      return;
    }

    const cookieTheme = document.cookie
      .split("; ")
      .find((row) => row.startsWith(storageKey + "="))
      ?.split("=")[1];

    if (cookieTheme === "light" || cookieTheme === "dark") {
      document.documentElement.dataset.theme = cookieTheme;
      document.documentElement.style.colorScheme = cookieTheme;
      return;
    }

    document.documentElement.style.colorScheme = window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  } catch {
  }
})();
`;

async function getInitialTheme() {
  const cookieStore = await cookies();
  const theme = cookieStore.get(themeStorageKey)?.value;

  return theme === "light" || theme === "dark" ? theme : undefined;
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialTheme = await getInitialTheme();
  const initialDistanceUnit = await getServerDistanceUnit();

  return (
    <html
      lang="en"
      className="h-full antialiased"
      data-theme={initialTheme}
      data-distance-unit={initialDistanceUnit}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-(--background) font-sans text-(--text)">
        <Script
          id="running-signals-theme"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
        <Script
          id="running-signals-distance-unit"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: distanceUnitScript }}
        />
        <DistanceUnitProvider initialUnit={initialDistanceUnit}>
          {children}
        </DistanceUnitProvider>
      </body>
    </html>
  );
}
