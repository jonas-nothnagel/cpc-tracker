"use client";

import type { ReactNode } from "react";
import { EYEBROW, pillClass, SEGMENT_CLASS } from "./pill";

type ViewMode = "coherence" | "finance";

/**
 * Explorer flagship canvas — a single, non-scrolling screen.
 *
 * Three grid rows fill the height the host gives it (the briefing finale or
 * the standalone explore page):
 *   1. Top bar        — title, live stat line, answers recall and the
 *                       Coherence / Finance view switch.
 *   2. Controls strip — group-by, the alignment filter, the legend.
 *   3. Stage          — the wheel (left, about two thirds of the width,
 *                       sized by that width) and the persistent rail (right):
 *                       the corpus summary and the ask bar at rest, the answer
 *                       or the selected detail otherwise. The rail is absolutely
 *                       positioned inside its cell so the wheel alone sets the
 *                       row height and the rail scrolls within it. Below `lg`
 *                       the rail stacks under the wheel at a fixed height, so
 *                       there is always exactly one rail (and one ask input)
 *                       in the DOM.
 *
 * Height is content-driven (the page scrolls on short viewports), the way the
 * standalone explorer always sized: a bigger wheel beats a one-screen fit.
 * Purely presentational: every interactive piece is built by the parent and
 * passed in; the top-bar controls are the one exception, rendered here so the
 * chrome stays in one place.
 */
export function WorkbenchStage({
  title,
  statLead,
  statFlagged,
  statTail,
  showViewSwitch,
  view,
  onViewChange,
  viewLabel,
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
  showViewSwitch: boolean;
  /** Eyebrow before the view switch ("View"). */
  viewLabel: string;
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
    <div className="grid w-full min-w-0 grid-cols-1 bg-white">
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
          {/* The view switch is the top bar's one control, so it reads as
              such: a labelled, larger segmented pill. */}
          {showViewSwitch && (
            <div className="flex items-center gap-2.5">
              <span className={EYEBROW}>{viewLabel}</span>
              <div className={SEGMENT_CLASS} role="group" aria-label={viewLabel}>
                <button
                  type="button"
                  onClick={() => onViewChange("coherence")}
                  aria-pressed={view === "coherence"}
                  className={pillClass(view === "coherence", "bg-[var(--undp-black)]", "md")}
                >
                  {viewCoherenceLabel}
                </button>
                <button
                  type="button"
                  onClick={() => onViewChange("finance")}
                  aria-pressed={view === "finance"}
                  className={pillClass(view === "finance", "bg-[#0e7490]", "md")}
                >
                  {viewFinanceLabel}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 2 · Controls strip ──────────────────────────────────── */}
      {controls}

      {/* ── Row 3 · Stage (wheel + rail) ────────────────────────────── */}
      <div className="grid min-w-0 grid-cols-1 gap-4 px-4 py-3 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,32%)] xl:grid-cols-[minmax(0,1fr)_minmax(380px,34%)]">
        <div className="flex min-w-0 items-center justify-center">{wheel}</div>
        {/* The rail is absolute inside its cell: the cell stretches to the
            wheel's row height without adding its own, so the rail scrolls
            within the wheel's height on lg+. Stacked below lg it gets a fixed
            height instead. */}
        <div className="relative h-[520px] min-w-0 lg:h-auto lg:min-h-[560px]">
          <div className="absolute inset-0">{rail}</div>
        </div>
      </div>

      {modal}
    </div>
  );
}
