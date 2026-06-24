"use client";

import type { ReactNode } from "react";

/**
 * Explorer B canvas. A reflowing three-column layout — lens pane (left), hero
 * wheel + command dock (centre), answers (right) — so the pieces sit beside one
 * another rather than overlapping. Nothing is an absolute overlay over the
 * wheel, so the lens stays clickable, the wheel's edge labels never slide under
 * the lens, and opening the answers panel reserves space (the wheel reflows)
 * instead of covering it. No visible frame: it blends into the briefing page.
 * Stacks vertically on small screens. Purely presentational — every interactive
 * piece is built by the parent. Nothing carries a z-index so the briefing's
 * sticky section nav (z-10) always paints over it.
 */
export function WorkbenchStage({
  statLine,
  lensPane,
  wheel,
  dock,
  answers,
  answersOpen,
  onToggleAnswers,
  answersHandleLabel,
  answersHeading,
  answersToggleTitle,
  answersClose,
  financeActive,
  financeNote,
  footerCaveat,
  modal,
}: {
  statLine: string;
  lensPane: ReactNode;
  wheel: ReactNode;
  dock: ReactNode;
  answers: ReactNode;
  answersOpen: boolean;
  onToggleAnswers: () => void;
  answersHandleLabel: string;
  answersHeading: string;
  answersToggleTitle: string;
  answersClose: string;
  financeActive: boolean;
  financeNote: string;
  footerCaveat: string;
  modal?: ReactNode;
}) {
  return (
    <section className="mb-2">
      <p className="mb-4 text-[12px] text-[var(--undp-gray)]">{statLine}</p>

      <div className="relative mx-auto flex max-w-[1180px] flex-col gap-6 lg:flex-row lg:items-start lg:gap-6">
        {/* Lens pane — left column. */}
        <div className="lg:w-[250px] lg:shrink-0">{lensPane}</div>

        {/* Hero wheel + command dock — centre column. */}
        <div className="flex min-w-0 flex-1 flex-col items-center">
          <div className="w-full max-w-[860px]">{wheel}</div>
          {financeActive && (
            <p className="mt-1 max-w-[460px] text-center text-[11px] text-[var(--undp-gray)]">
              {financeNote}
            </p>
          )}
          <div className="mt-5 w-full max-w-[720px]">{dock}</div>
        </div>

        {/* Answers — a right column when open (reserves space, no overlap),
            otherwise a small handle on the right edge. */}
        {answersOpen ? (
          <div className="w-full lg:w-[346px] lg:shrink-0">
            <div className="flex max-h-[760px] flex-col rounded-2xl border border-gray-200 bg-white shadow-lg">
              <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-3.5 py-2.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--undp-gray)]">
                  {answersHeading}
                </span>
                <button
                  type="button"
                  onClick={onToggleAnswers}
                  title={answersToggleTitle}
                  className="text-[11px] font-medium text-[var(--undp-gray)] transition-colors hover:text-[var(--undp-black)]"
                >
                  {answersClose}
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3.5">
                {answers}
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onToggleAnswers}
            title={answersToggleTitle}
            aria-expanded={false}
            className="absolute right-0 top-0 hidden items-center rounded-l-xl border border-r-0 border-gray-200 bg-white px-2.5 py-3 text-[11px] font-semibold tracking-wide text-[var(--undp-gray)] shadow-md transition-colors hover:text-[var(--undp-black)] lg:flex"
            style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
          >
            {answersHandleLabel}
          </button>
        )}
      </div>

      <p className="mt-4 flex items-center gap-2 text-[11px] text-[var(--undp-gray)]">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--undp-yellow,#edb716)]" />
        {footerCaveat}
      </p>

      {modal}
    </section>
  );
}
