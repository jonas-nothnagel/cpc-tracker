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

export type UploadErrorCode =
  | "tooLarge"
  | "tableTooLarge"
  | "type"
  | "noTargets"
  | "signIn"
  | "unavailable"
  | "generic"
  | "notSaved"
  | "readFailed";

export interface UploadError {
  code: UploadErrorCode;
  /** The file the error is about. */
  file?: string;
}

const POLL_MS = 2500;
// Browsers refuse keepalive bodies over 64 KiB in flight.
const KEEPALIVE_MAX = 60_000;

/** A new target's key, chosen by the page so two tabs never share one. */
function targetKey(docId: string): string {
  return `${docId}-a${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
}
const KNOWN: ReadonlySet<string> = new Set(["tooLarge", "tableTooLarge", "type", "noTargets", "unavailable"]);

function errorOf(status: number, code: unknown, file?: string): UploadError {
  if (status === 401) return { code: "signIn", file };
  return { code: typeof code === "string" && KNOWN.has(code) ? (code as UploadErrorCode) : "generic", file };
}

/** A draft's address in the page's language (English carries no prefix). */
export function uploadPath(locale: string, id?: string): string {
  return `${locale === "en" ? "" : `/${locale}`}/upload${id ? `/${id}` : ""}`;
}

export function useDraft(initial: Draft | null, opts: { locale: string; country: string; ahead?: number }) {
  const [draft, setDraft] = useState<Draft | null>(initial);
  const [ahead, setAhead] = useState(opts.ahead ?? 0);
  const [startError, setStartError] = useState<"busy" | "generic" | null>(null);
  const [error, setError] = useState<UploadError | null>(null);
  const [adding, setAdding] = useState(false);
  const latest = useRef<Draft | null>(initial);
  // Edits sent and not yet answered: while any is, the server's copy may
  // not have them, so it is not shown over the page's own.
  const unsaved = useRef(0);
  // The same edits as answers to wait for: the start waits until each is
  // saved (true) or refused (false).
  const saving = useRef(new Set<Promise<boolean>>());
  const creating = useRef<Promise<Draft | null> | null>(null);

  const adopt = useCallback((next: Draft | null | undefined) => {
    if (!next) return;
    latest.current = next;
    setDraft(next);
  }, []);

  /** The server's copy, shown when no edit of this page is still on its way. */
  const refetch = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/upload/${id}`);
      if (!res.ok) return;
      const body = await res.json();
      if (unsaved.current === 0) adopt(body.draft);
      if (typeof body.ahead === "number") setAhead(body.ahead);
    } catch {
      // The next look tries again.
    }
  }, [adopt]);

  const ensure = useCallback(async (): Promise<Draft | null> => {
    if (latest.current) return latest.current;
    // Two drops before the draft exists make one draft.
    creating.current ??= (async () => {
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
    })();
    const created = await creating.current;
    if (!created) creating.current = null;
    return created;
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

  const change = useCallback((given: DraftChange) => {
    const current = latest.current;
    if (!current) return;
    const c = given.op === "addTarget" && !given.key ? { ...given, key: targetKey(given.docId) } : given;
    const next = structuredClone(current);
    applyChanges(next, [c]);
    latest.current = next;
    setDraft(next);
    const body = JSON.stringify({ changes: [c] });
    unsaved.current += 1;
    const sent: Promise<boolean> = fetch(`/api/upload/${current.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
      // A field left by closing the tab still arrives, when small enough.
      keepalive: body.length < KEEPALIVE_MAX,
    })
      .then(async (res) => {
        unsaved.current -= 1;
        if (res.ok) {
          const saved = await res.json().catch(() => ({}));
          if (unsaved.current === 0) adopt(saved.draft);
          return true;
        }
        setError({ code: res.status === 401 ? "signIn" : "notSaved" });
        refetch(current.id);
        return false;
      })
      .catch(() => {
        unsaved.current -= 1;
        setError({ code: "notSaved" });
        refetch(current.id);
        return false;
      });
    saving.current.add(sent);
    void sent.then(() => saving.current.delete(sent));
  }, [adopt, refetch]);

  const read = useCallback(async () => {
    const current = latest.current;
    if (!current) return;
    setError(null);
    try {
      const res = await fetch(`/api/upload/${current.id}/read`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) setError({ code: "signIn" });
      else if (!res.ok) setError({ code: body.code === "unavailable" ? "unavailable" : "readFailed" });
      else adopt(body.draft);
    } catch {
      setError({ code: "readFailed" });
    }
  }, [adopt]);

  /** Start the analysis; its id, or null when it could not start. */
  const start = useCallback(async (clientId: string): Promise<string | null> => {
    const current = latest.current;
    if (!current) return null;
    setStartError(null);
    // Edits still on their way are saved first, so the analysis starts on
    // what the page shows; one that was refused stops the start, and the
    // page says so and shows what the server has.
    const saved = await Promise.all(saving.current);
    if (saved.includes(false)) return null;
    try {
      const res = await fetch(`/api/upload/${current.id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const body = await res.json().catch(() => ({}));
      // Started now, or already (a second press, another tab).
      if (res.ok || (res.status === 409 && body.analysisId)) return body.analysisId ?? current.id;
      if (res.status === 401) setError({ code: "signIn" });
      else setStartError(body.code === "busy" ? "busy" : "generic");
    } catch {
      setStartError("generic");
    }
    return null;
  }, []);

  const draftId = draft?.id;
  const reading = draft?.documents.some((d) => d.state === "queued" || d.state === "reading") ?? false;
  useEffect(() => {
    if (!draftId || !reading) return;
    const timer = window.setInterval(() => refetch(draftId), POLL_MS);
    return () => window.clearInterval(timer);
  }, [refetch, draftId, reading]);

  return { draft, ahead, error, startError, adding, addFiles, change, read, start };
}
