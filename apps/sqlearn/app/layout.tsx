import type { Metadata } from "next";
import { cookies } from "next/headers";
import Script from "next/script";
import "./globals.css";
import { AuthControls } from "./auth-controls";

export const metadata: Metadata = {
  title: {
    default: "sqlearn",
    template: "%s | sqlearn",
  },
  description: "Interactive SQL learning using my own running data.",
};

const themeStorageKey = "sqlearn-theme";

const themeScript = `
(() => {
  try {
    const storageKey = "${themeStorageKey}";
    const savedTheme = window.localStorage.getItem(storageKey);
    const cookieTheme = document.cookie
      .split("; ")
      .find((row) => row.startsWith(storageKey + "="))
      ?.split("=")[1];
    const theme = savedTheme === "light" || savedTheme === "dark"
      ? savedTheme
      : cookieTheme === "light" || cookieTheme === "dark"
        ? cookieTheme
        : null;

    if (theme) {
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
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
      data-scroll-behavior="smooth"
      data-theme={initialTheme}
      lang="en"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <Script
          id="sqlearn-theme"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
        <AuthControls />
        {children}
      </body>
    </html>
  );
}
