import type { Metadata } from "next";
import { cookies } from "next/headers";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Running Signals",
  description: "Live analytics engineering project for Garmin running data modeled into signal marts.",
};

const themeStorageKey = "running-signals-theme";

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

  return (
    <html
      lang="en"
      className="h-full antialiased"
      data-theme={initialTheme}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <Script
          id="running-signals-theme"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
        {children}
      </body>
    </html>
  );
}
