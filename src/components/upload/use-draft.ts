"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyChanges } from "@/lib/upload/changes";
import type { Draft, DraftChange } from "@/lib/upload/types";

/**
 * The page's side of an upload's draft. The first file creates the draft and
 * gives the page its own address (/upload/{id}), so a reload or a closed tab
 * loses nothing. Edits apply at once and go to the server one by one; while
 * documents are read, the page looks every 2.5 seconds.
 */

export type UploadErrorCode = "tooLarge" | "tableTooLarge" | "type" | "noTargets" | "signIn" | "unavailable" | "generic";

export interface UploadError {
  code: UploadErrorCode;
  /** The file the error is about. */
  file?: string;
}

const POLL_MS = 2500;
const KNOWN: ReadonlySet<string> = new Set(["tooLarge", "tableTooLarge", "type", "noTargets", "unavailable"]);

function errorOf(status: number, code: unknown, file?: string): UploadError {
  if (status === 401) return { code: "signIn", file };
  return { code: typeof code === "string" && KNOWN.has(code) ? (code as UploadErrorCode) : "generic", file };
}

/** A draft's address in the page's language (English carries no prefix). */
export function uploadPath(locale: string, id?: string): string {
  return `${locale === "en" ? "" : `/${locale}`}/upload${id ? `/${id}` : ""}`;
}

export function useDraft(initial: Draft | null, opts: { locale: string; country: string }) {
  const [draft, setDraft] = useState<Draft | null>(initial);
  const [ahead, setAhead] = useState(0);
  const [error, setError] = useState<UploadError | null>(null);
  const [adding, setAdding] = useState(false);
  const latest = useRef<Draft | null>(initial);

  const adopt = useCallback((next: Draft | null | undefined) => {
    if (!next) return;
    latest.current = next;
    setDraft(next);
  }, []);

  const ensure = useCallback(async (): Promise<Draft | null> => {
    if (latest.current) return latest.current;
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country: opts.country, locale: opts.locale }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.draft) {
      setError(errorOf(res.status, body.code));
      return null;
    }
    adopt(body.draft);
    // The draft's own address, without a navigation that would reset the page.
    window.history.replaceState(null, "", `${uploadPath(opts.locale, body.draft.id)}${window.location.search}`);
    return body.draft as Draft;
  }, [adopt, opts.country, opts.locale]);

  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setError(null);
      setAdding(true);
      try {
        const d = await ensure();
        if (!d) return;
        for (const file of files) {
          const form = new FormData();
          form.set("file", file);
          const res = await fetch(`/api/upload/${d.id}/documents`, { method: "POST", body: form });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) setError(errorOf(res.status, body.code, file.name));
          else adopt(body.draft);
        }
      } catch {
        setError({ code: "generic", file: files[0]?.name });
      } finally {
        setAdding(false);
      }
    },
    [adopt, ensure],
  );

  const change = useCallback((c: DraftChange) => {
    const current = latest.current;
    if (!current) return;
    const next = structuredClone(current);
    applyChanges(next, [c]);
    latest.current = next;
    setDraft(next);
    fetch(`/api/upload/${current.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changes: [c] }),
      // A field left by closing the tab still arrives.
      keepalive: true,
    }).catch(() => undefined);
  }, []);

  const read = useCallback(async () => {
    const current = latest.current;
    if (!current) return;
    setError(null);
    try {
      const res = await fetch(`/api/upload/${current.id}/read`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setError(errorOf(res.status, body.code));
      else adopt(body.draft);
    } catch {
      setError({ code: "generic" });
    }
  }, [adopt]);

  const draftId = draft?.id;
  const reading = draft?.documents.some((d) => d.state === "queued" || d.state === "reading") ?? false;
  useEffect(() => {
    if (!draftId || !reading) return;
    const timer = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/upload/${draftId}`);
        if (!res.ok) return;
        const body = await res.json();
        adopt(body.draft);
        if (typeof body.ahead === "number") setAhead(body.ahead);
      } catch {
        // The next look tries again.
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [adopt, draftId, reading]);

  return { draft, ahead, error, adding, addFiles, change, read, setError };
}
