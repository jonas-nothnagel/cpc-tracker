"use client";

import type { ReactNode } from "react";
import type { SectionId } from "@/lib/brief/selection";

/**
 * The brief on screen: one flowing page that picks up where the landing
 * leaves off. The coherence overview first, then any other sections the
 * reader keeps, without page frames, running heads or fixed slot heights;
 * the A4 sheets exist for printing and the print preview.
 */
export function Flow({
  hidden = false,
  overview,
  sections,
  renderSection,
}: {
  /** Hidden while the print preview shows; kept mounted so open rows and
   *  selections survive the round trip. */
  hidden?: boolean;
  overview?: ReactNode;
  sections: SectionId[];
  renderSection: (id: SectionId) => ReactNode;
}) {
  return (
    <main className="brief-flow" data-testid="brief-flow" data-screen-only hidden={hidden}>
      {overview}
      {sections.map((id) => (
        <section key={id} id={`brief-flow-${id}`} className="brief-flow-section" data-section={id}>
          {renderSection(id)}
        </section>
      ))}
    </main>
  );
}
