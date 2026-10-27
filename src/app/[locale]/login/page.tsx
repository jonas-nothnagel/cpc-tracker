"use client";

import "@/components/brief/brief.css";
import "@/components/upload/upload.css";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("upload.login");
  const brand = useTranslations("header")("brand");

  const [token, setToken] = useState("");
  const [error, setError] = useState<"wrong" | "failed" | "offline" | null>(null);
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
      setError(res.status === 401 ? "wrong" : "failed");
    } catch {
      setError("offline");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div data-brief className="up-root">
      <main className="up-wait">
        <form onSubmit={onSubmit} className="up-login">
          <h1 className="up-title">{brand}</h1>
          <p className="up-line">{t("lead")}</p>
          <div className="up-field">
            <label htmlFor="token">{t("token")}</label>
            <input
              id="token"
              name="token"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="up-error">
              {t(`errors.${error}`)}
            </p>
          )}
          <button type="submit" className="brief-button-primary" disabled={submitting || token.length === 0}>
            {submitting ? t("signingIn") : t("signIn")}
          </button>
        </form>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
