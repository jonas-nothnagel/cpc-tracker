"use client";

import type { ReactNode } from "react";

type ViewMode = "coherence" | "finance";

/**
 * Explorer flagship canvas — a single, non-scrolling screen.
 *
 * Three grid rows fill the height the briefing finale gives it:
 *   1. Top bar      — title, live stat line, share / country / view switch.
 *   2. Stage        — lens rail (left) + the wheel (right), with the answer
 *                     as a *floating overlay* that never reflows the wheel.
 *   3. Ask dock     — always visible so the question box and its toggles stay
 *                     on screen while an answer plays out on the wheel.
 *
 * `minmax(0,1fr)` on the middle row lets it shrink below its content so the
 * wheel scales down on short viewports instead of pushing the dock off-screen.
 * Purely presentational: every interactive piece is built by the parent and
 * passed in; the top-bar controls are the one exception, rendered here so the
 * one-screen chrome stays in one place.
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
  lensPane,
  wheel,
  answerOpen,
  answerCard,
  answersAvailable,
  onShowAnswers,
  answersLabel,
  dock,
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
  lensPane: ReactNode;
  wheel: ReactNode;
  /** Whether the floating answer card is showing (slides the wheel left). */
  answerOpen: boolean;
  answerCard: ReactNode;
  /** An answer exists but the card is collapsed: offer a way back to it. */
  answersAvailable: boolean;
  onShowAnswers: () => void;
  answersLabel: string;
  dock: ReactNode;
  modal?: ReactNode;
}) {
  const pill = (active: boolean, activeBg: string) =>
    `cursor-pointer whitespace-nowrap rounded-full px-3.5 py-1.5 text-data font-medium transition-colors ${
      active
        ? `${activeBg} text-white`
        : "text-[var(--undp-gray)] hover:text-[var(--undp-black)]"
    }`;

  return (
    <div className="grid h-full w-full min-w-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-white">
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
          {/* Reachability: while the answer card is collapsed but an answer is
              still available, this brings it back (the old drawer handle). */}
          {answersAvailable && !answerOpen && (
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
            <div className="inline-flex items-center gap-0.5 rounded-full border border-line-strong bg-white p-[3px]">
              <button
                type="button"
                onClick={() => onViewChange("coherence")}
                aria-pressed={view === "coherence"}
                className={pill(view === "coherence", "bg-[var(--undp-black)]")}
              >
                {viewCoherenceLabel}
              </button>
              <button
                type="button"
                onClick={() => onViewChange("finance")}
                aria-pressed={view === "finance"}
                className={pill(view === "finance", "bg-[#0e7490]")}
              >
                {viewFinanceLabel}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 2 · Stage (lens rail + wheel with floating answer) ───── */}
      <div className="grid min-h-0 min-w-0 grid-cols-1 gap-3.5 px-4 py-2 sm:px-6 lg:grid-cols-[224px_minmax(0,1fr)]">
        {/* Lens rail — hidden on narrow screens where the wheel needs the room. */}
        <div className="hidden min-h-0 self-start lg:block lg:max-h-full lg:overflow-y-auto lg:overflow-x-hidden [scrollbar-width:thin]">
          {lensPane}
        </div>

        {/* Wheel stage. The wheel is centred and glides left when an answer is
            open; the answer card floats over the right, never reflowing it. */}
        <div className="relative flex min-h-0 min-w-0 items-center justify-center">
          <div
            className="flex h-full w-full min-w-0 items-center justify-center transition-transform duration-500 [transition-timing-function:var(--ease-out)] motion-reduce:transition-none"
            style={{
              transform: answerOpen
                ? "translateX(clamp(-150px, -13%, -80px))"
                : "translateX(0)",
            }}
          >
            {wheel}
          </div>

          {/* No -translate-y-1/2 class on the card: Tailwind v4 compiles it to
              the standalone `translate` property, which composes with the
              inline `transform` rather than being overridden by it, so the card
              would sit a full 100% up. The inline transform owns centring. */}
          <div
            aria-hidden={!answerOpen}
            className="pointer-events-none absolute right-0 top-1/2 z-10 flex max-h-[calc(100%-1.5rem)] w-[min(344px,86%)] transition-[opacity,transform] duration-500 [transition-timing-function:var(--ease-out)] motion-reduce:transition-none"
            style={{
              opacity: answerOpen ? 1 : 0,
              transform: answerOpen
                ? "translate(0, -50%)"
                : "translate(26px, -50%)",
            }}
          >
            {/* min-h-0 (not max-h-full): a percentage max-height would resolve
                against an auto-height parent and compute to `none`, letting a
                long answer grow past the stage and slide under the top bar.
                Stretching a shrinkable flex item keeps it inside the cap. */}
            <div
              className={`flex min-h-0 w-full ${answerOpen ? "pointer-events-auto" : ""}`}
            >
              {answerCard}
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 3 · Ask dock ────────────────────────────────────────── */}
      <div className="flex flex-col items-center px-4 pb-3 pt-1 sm:px-6">
        <div className="w-full max-w-[860px]">{dock}</div>
      </div>

      {modal}
    </div>
  );
}
