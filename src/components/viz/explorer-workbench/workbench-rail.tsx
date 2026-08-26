"use client";

import type { ReactNode } from "react";
import type { RailMode } from "./rail-mode";

/**
 * The workbench's persistent right rail: a header with the current eyebrow
 * and, outside the summary, a text button back to it; a scrolling body; and a
 * pinned footer that always holds the ask bar and its caveat, so the question
 * box never leaves the screen while an answer or a detail is open.
 *
 * Purely presentational; the parent decides the mode (see rail-mode.ts) and
 * builds every piece of content.
 */
export function WorkbenchRail({
  mode,
  eyebrow,
  onBack,
  backLabel,
  body,
  footer,
}: {
  mode: RailMode;
  eyebrow: string;
  /** Rendered only outside the summary; returns the rail to it. */
  onBack?: () => void;
  backLabel: string;
  body: ReactNode;
  footer: ReactNode;
}) {
  return (
    <aside
      aria-label={eyebrow}
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-white shadow-[var(--shadow-card)]"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line-soft px-4 py-2.5">
        <span
          className={`text-caption font-medium ${
            mode === "answer" ? "text-[var(--undp-blue)]" : "text-[var(--undp-gray)]"
          }`}
        >
          {eyebrow}
        </span>
        {mode !== "summary" && onBack && (
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 text-caption font-medium text-[var(--undp-blue)] hover:underline"
          >
            {backLabel}
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-3.5 [scrollbar-width:thin]">
        {body}
      </div>
      <div className="shrink-0 border-t border-line-soft px-3.5 pb-3 pt-3">{footer}</div>
    </aside>
  );
}
