"use client";

/**
 * Explore section — the open-ended finale of the findings home.
 *
 * The finale is the full-width "workbench": the interactive coherence wheel
 * (PolicyCoherenceExplorer, variant="workbench") with its controls, a
 * persistent prominent chat, rotating insights, and on-click target / category
 * detail. This component owns only the section heading + intro and the section
 * landmark (id, scroll margin, aria-labelledby); the workbench itself is passed
 * in as children from the briefing so it can be fed the shared explorer props.
 */

import type { ReactNode } from "react";

export const EXPLORE_SECTION_ID = "explore";

const HEADLINE_SERIF =
  "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif";

export function ExploreSection({ children }: { children: ReactNode }) {
  return (
    <section
      id={EXPLORE_SECTION_ID}
      className="scroll-mt-24 pt-2"
      aria-labelledby={`${EXPLORE_SECTION_ID}-heading`}
    >
      <h2
        id={`${EXPLORE_SECTION_ID}-heading`}
        className="text-[28px] sm:text-[32px] leading-[1.15] text-[var(--undp-black)] font-medium mb-3"
        style={{ fontFamily: HEADLINE_SERIF }}
      >
        Explore the policy coherence yourself.
      </h2>
      <p className="text-[14px] leading-relaxed text-[var(--undp-black)] max-w-prose mb-6">
        Ask a question across the policies, follow an insight, or work the full
        wheel yourself: click any target for its detail, search for a specific
        one, regroup the arcs, hide a document, or bring in the budget view.
      </p>
      {children}
    </section>
  );
}
