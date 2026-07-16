"use client";

/**
 * FeedbackControl — anonymous thumbs up/down plus an optional written note
 * on one piece of AI-generated content (a pair rationale or a doc-pair
 * synthesis). First slice of the audit's contradiction-review roadmap item:
 * the note doubles as the complaint capture for the hallucination KPI.
 *
 * Every interaction appends an event to the server-side per-country ledger
 * (POST /api/feedback); nothing is ever overwritten. The browser's own vote
 * is mirrored in localStorage, keyed by the stable anchor and validated
 * against a hash of the displayed text, so after a pipeline re-run changes
 * the rationale the control honestly renders unvoted while the old event
 * stays in the ledger. Other users' votes are never shown (no aggregates in
 * the UI by design; the data is for the project team's review and KPI).
 */

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { anchorKeyOf } from "@/lib/feedback/anchor";
import { sha256Hex } from "@/lib/feedback/hash";
import {
  FEEDBACK_COMMENT_MAX,
  FEEDBACK_SNAPSHOT_MAX,
  type FeedbackContext,
  type FeedbackPostBody,
  type FeedbackSurface,
} from "@/lib/feedback/types";

const CLIENT_ID_KEY = "cpc-feedback-client-id";
const MIRROR_PREFIX = "cpc-feedback-v1";

type ActiveVote = "up" | "down";

interface MirrorValue {
  h: string;
  v: ActiveVote;
  c: string | null;
}

/** In-memory fallback when localStorage is unavailable (rare; per-session). */
let memoryClientId: string | null = null;

function getClientId(): string {
  try {
    const stored = localStorage.getItem(CLIENT_ID_KEY);
    if (stored) return stored;
    const fresh = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, fresh);
    return fresh;
  } catch {
    if (!memoryClientId) memoryClientId = crypto.randomUUID();
    return memoryClientId;
  }
}

function readMirror(key: string, hash: string): MirrorValue | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MirrorValue;
    // A hash mismatch means the AI text changed since the vote (pipeline
    // re-run): render unvoted and allow fresh feedback.
    if (parsed.h !== hash) return null;
    if (parsed.v !== "up" && parsed.v !== "down") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeMirror(key: string, value: MirrorValue | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore; the ledger entry is the record, the mirror is convenience.
  }
}

export function FeedbackControl({
  countryId,
  surface,
  anchorIds,
  contentText,
  context,
  variant = "inline",
}: {
  /** Canonical country slug; the control hides when absent (uploaded runs). */
  countryId?: string;
  surface: FeedbackSurface;
  /** 1-2 stable ids: target pair, doc pair, or one storyline slug. */
  anchorIds: string[];
  /** Full AI text being rated; hashed for re-run staleness detection. */
  contentText: string;
  /** AI verdict fields at vote time (analysis-only). */
  context?: FeedbackContext;
  /**
   * "bar" renders as a sticky bottom bar; place it as the LAST child of a
   * drawer's scroll container so it pins to the viewport bottom (user
   * testing: inline placement below the fold was missed). "inline" is
   * chrome-free; the host owns spacing.
   */
  variant?: "inline" | "bar";
}) {
  const t = useTranslations("briefing.drawer.pair.feedback");
  const locale = useLocale();

  const [hash, setHash] = useState<string | null>(null);
  const [vote, setVote] = useState<ActiveVote | null>(null);
  const [comment, setComment] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  // The anchor the current state belongs to; guards against state bleeding
  // across pair changes while the drawer stays mounted.
  const stateKeyRef = useRef<string | null>(null);

  const anchorKey = anchorKeyOf(anchorIds);
  const mirrorKey = countryId
    ? `${MIRROR_PREFIX}:${countryId}:${surface}:${anchorKey}`
    : null;

  useEffect(() => {
    if (!mirrorKey) return;
    if (typeof crypto === "undefined" || !crypto.subtle) return;
    let cancelled = false;
    sha256Hex(contentText).then((h) => {
      if (cancelled) return;
      stateKeyRef.current = mirrorKey;
      setHash(h);
      const mirrored = readMirror(mirrorKey, h);
      setVote(mirrored?.v ?? null);
      setComment(mirrored?.c ?? null);
      setEditing(false);
      setDraft("");
      setFailed(false);
    });
    return () => {
      cancelled = true;
    };
  }, [mirrorKey, contentText]);

  // Hidden until the anchor is known and hashed: no country (uploaded-run
  // dashboards have no per-country ledger) or crypto.subtle unavailable.
  if (!countryId || !mirrorKey || hash === null) return null;
  if (stateKeyRef.current !== mirrorKey) return null;

  async function post(
    nextVote: "up" | "down" | "retracted",
    nextComment: string | null,
  ): Promise<boolean> {
    const body: FeedbackPostBody = {
      country: countryId!,
      surface,
      anchorIds,
      vote: nextVote,
      comment: nextComment ?? undefined,
      clientId: getClientId(),
      locale,
      contentHash: hash!,
      contentSnapshot: contentText.slice(0, FEEDBACK_SNAPSHOT_MAX),
      context,
    };
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function handleVote(next: ActiveVote) {
    if (busy) return;
    const prevVote = vote;
    const prevComment = comment;
    const retracting = vote === next;
    // Optimistic update; revert on failure.
    setBusy(true);
    setFailed(false);
    setVote(retracting ? null : next);
    if (retracting) {
      setComment(null);
      setEditing(false);
    }
    const ok = await post(
      retracting ? "retracted" : next,
      retracting ? null : prevComment,
    );
    if (ok) {
      writeMirror(
        mirrorKey!,
        retracting ? null : { h: hash!, v: next, c: prevComment },
      );
    } else {
      setVote(prevVote);
      setComment(prevComment);
      setFailed(true);
    }
    setBusy(false);
  }

  async function handleNoteSend() {
    if (busy || !vote) return;
    const trimmed = draft.trim();
    const next = trimmed.length > 0 ? trimmed : null;
    setBusy(true);
    setFailed(false);
    const ok = await post(vote, next);
    if (ok) {
      setComment(next);
      setEditing(false);
      writeMirror(mirrorKey!, { h: hash!, v: vote, c: next });
    } else {
      setFailed(true);
    }
    setBusy(false);
  }

  const voteLine =
    vote === "up" ? t("votedUp") : vote === "down" ? t("votedDown") : null;

  return (
    <div
      className={
        variant === "bar"
          ? "sticky bottom-0 z-10 border-t border-gray-200 px-6 py-3"
          : undefined
      }
      // Opaque bg so scrolled content disappears beneath the sticky bar.
      style={variant === "bar" ? { backgroundColor: "#fbfaf7" } : undefined}
    >
      <div
        role="group"
        aria-label={t("groupAria")}
        className="flex items-center gap-3 flex-wrap"
      >
        <p className="text-[11px] uppercase tracking-wider text-[var(--undp-gray)]">
          {t("prompt")}
        </p>
        <ThumbButton
          direction="up"
          active={vote === "up"}
          disabled={busy}
          label={t("upAria")}
          onClick={() => handleVote("up")}
        />
        <ThumbButton
          direction="down"
          active={vote === "down"}
          disabled={busy}
          label={t("downAria")}
          onClick={() => handleVote("down")}
        />
      </div>

      {voteLine && (
        <p className="mt-1.5 text-[11px] text-[var(--undp-gray)]">
          {voteLine} {t("retractHint")}
          {!editing && (
            <>
              {" "}
              <button
                type="button"
                onClick={() => {
                  setDraft(comment ?? "");
                  setEditing(true);
                }}
                className="underline hover:text-[var(--undp-black)]"
              >
                {comment ? t("editNote") : t("addNote")}
              </button>
            </>
          )}
        </p>
      )}

      {vote && !editing && comment && (
        <p className="mt-1.5 text-[12px] text-[var(--undp-black)] leading-snug border-l-2 border-gray-300 pl-2">
          {comment}
        </p>
      )}

      {vote && editing && (
        <div className="mt-2">
          <label htmlFor={`feedback-note-${anchorKey}`} className="sr-only">
            {t("noteLabel")}
          </label>
          <textarea
            id={`feedback-note-${anchorKey}`}
            rows={2}
            maxLength={FEEDBACK_COMMENT_MAX}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("notePlaceholder")}
            className="w-full text-[12px] text-[var(--undp-black)] leading-snug border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-[var(--undp-gray)]"
          />
          <div className="mt-1 flex items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={handleNoteSend}
              className="text-[11px] underline text-[var(--undp-black)] hover:text-[var(--undp-gray)] disabled:opacity-50"
            >
              {t("send")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setDraft("");
              }}
              className="text-[11px] underline text-[var(--undp-gray)] hover:text-[var(--undp-black)] disabled:opacity-50"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      )}

      <p className="mt-1.5 text-[11px] text-[var(--undp-gray)]">
        {t("anonNote")}
      </p>
      {failed && (
        <p role="status" className="mt-1 text-[11px] text-[#d12800]">
          {t("error")}
        </p>
      )}
    </div>
  );
}

const THUMB_COLORS = {
  up: "#196127",
  down: "#dc2626",
} as const;

function ThumbButton({
  direction,
  active,
  disabled,
  label,
  onClick,
}: {
  direction: "up" | "down";
  active: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  // Polarity-coloured circular buttons (green up / terracotta down) so the
  // feedback affordance is visible at a glance; user testing showed the
  // gray inline thumbs were being missed.
  const color = THUMB_COLORS[direction];
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded-full border transition-colors disabled:opacity-50"
      style={{
        color,
        borderColor: active ? color : `${color}66`,
        backgroundColor: active ? `${color}1a` : "#ffffff",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = `${color}14`;
        e.currentTarget.style.borderColor = color;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = active ? `${color}1a` : "#ffffff";
        e.currentTarget.style.borderColor = active ? color : `${color}66`;
      }}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={direction === "down" ? { transform: "rotate(180deg)" } : undefined}
      >
        <path d="M7 10v12" />
        <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
      </svg>
    </button>
  );
}
