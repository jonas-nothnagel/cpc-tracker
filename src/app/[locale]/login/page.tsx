"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Upload sign-in: exchange the shared access token for a session cookie via
// /api/auth, then return to the upload page that asked for it. Only the
// document-upload flow is behind this; the rest of the app is open.

/** Only allow same-origin relative return paths (no open redirect). */
function safeReturnPath(raw: string | null): string {
  if (!raw) return "/upload";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/upload";
  return raw;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = safeReturnPath(searchParams.get("from"));

  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        router.replace(from);
        router.refresh();
        return;
      }
      setError(
        res.status === 401
          ? "That access token was not recognised."
          : "Sign-in failed. Please try again.",
      );
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-5 rounded-lg border border-gray-200 bg-white p-8 shadow-sm"
      >
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-gray-900">Nature–Climate Policy Tracker</h1>
          <p className="text-sm text-gray-500">
            Uploading documents and running a new analysis needs an access token.
            Browsing the existing dashboards does not.
          </p>
        </div>

        <div className="space-y-1">
          <label htmlFor="token" className="block text-sm font-medium text-gray-700">
            Access token
          </label>
          <input
            id="token"
            name="token"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || token.length === 0}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
