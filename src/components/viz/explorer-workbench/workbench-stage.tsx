"use client";

import type { ReactNode } from "react";
import { pillClass, SEGMENT_CLASS } from "./pill";

type ViewMode = "coherence" | "finance";

/**
 * Explorer flagship canvas — a single, non-scrolling screen.
 *
 * Three grid rows fill the height the host gives it (the briefing finale or
 * the standalone explore page):
 *   1. Top bar        — title, live stat line, answers recall / share /
 *                       country / view switch.
 *   2. Controls strip — group-by, the alignment filter, the legend.
 *   3. Stage          — the wheel (left, full remaining height) and the
 *                       persistent rail (right): the corpus summary and the
 *                       ask bar at rest, the answer or the selected detail
 *                       otherwise. Below `lg` the rail stacks under the wheel
 *                       as a definite 2/5 track with its own scroll, so there
 *                       is always exactly one rail (and one ask input) in the
 *                       DOM.
 *
 * `minmax(0,1fr)` on the stage row lets it shrink below its content so the
 * wheel scales down on short viewports. Purely presentational: every
 * interactive piece is built by the parent and passed in; the top-bar controls
 * are the one exception, rendered here so the one-screen chrome stays in one
 * place.
 */
export function WorkbenchStage({
  title,
  statLead,
  statFlagged,
  statTail,
  onShare,
  shareLabel,
  shareCopied,
  countryName,
  showViewSwitch,
  view,
  onViewChange,
  viewCoherenceLabel,
  viewFinanceLabel,
  controls,
  wheel,
  rail,
  answersAvailable,
  onShowAnswers,
  answersLabel,
  modal,
}: {
  title: string;
  /** Stat line split so the flagged count can carry its own colour + weight. */
  statLead: string;
  statFlagged: string;
  statTail: string;
  onShare: () => void;
  shareLabel: string;
  shareCopied: boolean;
  countryName: string;
  showViewSwitch: boolean;
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  viewCoherenceLabel: string;
  viewFinanceLabel: string;
  controls: ReactNode;
  wheel: ReactNode;
  rail: ReactNode;
  /** An answer exists but the rail shows the summary: offer a way back to it. */
  answersAvailable: boolean;
  onShowAnswers: () => void;
  answersLabel: string;
  modal?: ReactNode;
}) {
  return (
    <div className="grid h-full w-full min-w-0 grid-cols-1 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden bg-white">
      {/* ── Row 1 · Top bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 border-b border-line bg-white px-5 py-2.5 sm:px-6">
        <div className="min-w-0 flex-1">
          {/* On the house 5-step ramp: the same serif headline the Explore
              section used before it folded into this top bar. */}
          <h2 className="truncate font-display text-headline font-medium text-[var(--undp-black)]">
            {title}
          </h2>
          <p className="mt-0.5 truncate text-caption leading-normal text-[var(--undp-gray)]">
            {statLead}{" "}
            <span className="font-semibold text-[var(--color-flagged)]">
              {statFlagged}
            </span>{" "}
            · {statTail}
          </p>
        </div>
        <div className="flex flex-none items-center gap-2.5">
          {/* Reachability: while the rail shows the summary but an answer is
              still available, this brings it back. */}
          {answersAvailable && (
            <button
              type="button"
              onClick={onShowAnswers}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--undp-blue)] bg-white px-3.5 py-1.5 text-caption font-medium text-[var(--undp-blue)] transition-colors hover:bg-[var(--undp-blue)] hover:text-white"
            >
              {answersLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onShare}
            className={`hidden items-center gap-1.5 rounded-full border bg-white px-3.5 py-1.5 text-caption transition-colors sm:inline-flex ${
              shareCopied
                ? "border-[var(--undp-blue)] text-[var(--undp-blue)]"
                : "border-line-strong text-[var(--undp-gray)] hover:border-[var(--undp-black)] hover:text-[var(--undp-black)]"
            }`}
          >
            {shareLabel}
          </button>
          <span className="hidden items-center gap-1.5 rounded-full border border-line-strong bg-white px-3.5 py-1.5 text-[0.78rem] font-medium text-[var(--undp-black)] md:inline-flex">
            {countryName}
          </span>
          {showViewSwitch && (
            <div className={SEGMENT_CLASS}>
              <button
                type="button"
                onClick={() => onViewChange("coherence")}
                aria-pressed={view === "coherence"}
                className={pillClass(view === "coherence", "bg-[var(--undp-black)]")}
              >
                {viewCoherenceLabel}
              </button>
              <button
                type="button"
                onClick={() => onViewChange("finance")}
                aria-pressed={view === "finance"}
                className={pillClass(view === "finance", "bg-[#0e7490]")}
              >
                {viewFinanceLabel}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 2 · Controls strip ──────────────────────────────────── */}
      {controls}

      {/* ── Row 3 · Stage (wheel + rail) ────────────────────────────── */}
      <div className="grid min-h-0 min-w-0 grid-cols-1 grid-rows-[minmax(0,3fr)_minmax(0,2fr)] gap-3.5 px-4 py-2 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-1 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative flex min-h-0 min-w-0 items-center justify-center">
          {wheel}
        </div>
        <div className="min-h-0 min-w-0">{rail}</div>
      </div>

      {modal}
    </div>
  );
}
