"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wordmark } from "@/components/Wordmark";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Incorrect password.");
        setLoading(false);
        return;
      }
      const from =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("from")
          : null;
      // Full navigation so middleware re-evaluates with the new cookie.
      window.location.href = from && from.startsWith("/") ? from : "/";
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Wordmark subtitle="Volunteers" />
        </div>

        <div className="rounded-2xl border border-border bg-surface p-7 shadow-card">
          <h1 className="text-lg font-semibold text-ink">Organizer sign-in</h1>
          <p className="mt-1.5 text-sm text-muted">
            Enter the shared password to open the volunteer tracker.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-faint"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field"
                placeholder="••••••••••"
              />
            </div>

            {error && (
              <p className="text-sm text-crimson" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || password.length === 0}
              className="btn-primary w-full"
            >
              {loading ? "Checking…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-faint">
          Looking to volunteer?{" "}
          <a href="/join" className="text-sand underline-offset-2 hover:underline">
            Open the sign-up form
          </a>
          .
        </p>
      </div>
    </main>
  );
}
