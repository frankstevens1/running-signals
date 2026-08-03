"use client";

import { FormEvent, startTransition, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function UnlockPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, returnTo: searchParams.get("next") }),
      });
      const body = (await response.json()) as { error?: string; returnTo?: string };
      if (!response.ok) {
        setError(body.error ?? "Unable to unlock Sqlearn.");
        return;
      }

      startTransition(() => router.replace(body.returnTo ?? "/"));
    } catch {
      setError("Unable to unlock Sqlearn.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm border border-border bg-surface p-6">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent">Private workspace</p>
        <h1 className="mt-2 text-2xl font-semibold text-text">Unlock Sqlearn</h1>
        <p className="mt-2 text-sm leading-6 text-text-soft">Enter the shared password to access the SQL curriculum and playground.</p>
        <label className="mt-6 block text-sm text-text" htmlFor="sqlearn-password">Password</label>
        <input
          id="sqlearn-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-2 w-full border border-border bg-surface-muted px-3 py-2 text-text"
          required
        />
        {error ? <p className="mt-3 text-sm text-signal-error" role="alert">{error}</p> : null}
        <button
          type="submit"
          disabled={submitting}
          className="mt-5 w-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          {submitting ? "Unlocking..." : "Unlock"}
        </button>
      </form>
    </main>
  );
}
