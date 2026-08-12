"use client";

/**
 * SlideFrame — shared layout wrapper for every coherence-briefing slide.
 *
 * Enforces the deck-density template the prototype was retreated toward in
 * round 3: eyebrow + serif headline that IS the finding + a short body +
 * one optional evidence card + one optional disclosure trigger. Section
 * components compose their own evidence/disclosure children; the frame
 * just keeps the rhythm consistent so the scroll page reads like a deck
 * rather than a wall of prose.
 *
 * Body copy budget: aim for <= 35 words. Anything longer belongs in a
 * drawer reached via the disclosure slot.
 */

import { type ReactNode } from "react";

export function SlideFrame({
  id,
  headline,
  body,
  reading,
  controls,
  evidence,
  disclosure,
  tourButton,
}: {
  id: string;
  headline: ReactNode;
  body?: ReactNode;
  /** How to READ the evidence, as opposed to what it says. One quiet line under
   *  the finding, always visible (see src/components/ui/glossary). Optional:
   *  omit and the slide renders exactly as it did before reading lines existed. */
  reading?: ReactNode;
  controls?: ReactNode;
  evidence?: ReactNode;
  disclosure?: ReactNode;
  /** Guided-tour trigger for the slide's evidence, shown inline in the heading. */
  tourButton?: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 pt-2"
      aria-labelledby={`${id}-heading`}
    >
      <h2
        id={`${id}-heading`}
        className="font-display text-headline sm:text-headline-lg text-[var(--undp-black)] font-medium mb-4"
      >
        {headline}
        {/* Guided-tour trigger, inline in the heading like the InfoBox
            convention elsewhere (the eyebrow row it used to live in was
            removed in the density distill). */}
        {tourButton && (
          <span className="inline-flex align-middle ml-2.5">{tourButton}</span>
        )}
      </h2>
      {body && (
        <p className="text-body text-[var(--undp-black)] max-w-prose mb-4">
          {body}
        </p>
      )}
      {reading}
      {controls && <div className="mb-6">{controls}</div>}
      {evidence && <div className="mb-6">{evidence}</div>}
      {disclosure && (
        <div className="mt-6 border-t border-line pt-4">{disclosure}</div>
      )}
    </section>
  );
}
