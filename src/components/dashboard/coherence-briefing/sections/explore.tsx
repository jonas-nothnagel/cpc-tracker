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
import { useTranslations } from "next-intl";

export const EXPLORE_SECTION_ID = "explore";

export function ExploreSection({ children }: { children: ReactNode }) {
  const t = useTranslations("briefing.explore");
  // The Explore finale is a self-contained one-screen workbench: it owns its
  // own title, stat line, and controls in a top bar, so the section heading
  // and intro fold into that chrome and stay only as an accessible landmark.
  // Height fills the viewport below the app header + section nav (~8rem) so the
  // whole workbench (title, wheel, ask dock) sits on one screen without the
  // page scrolling within it. `100dvh` keeps mobile browser chrome honest.
  return (
    <section
      id={EXPLORE_SECTION_ID}
      className="flex h-[calc(100dvh-8rem)] min-h-[620px] scroll-mt-[8rem] flex-col"
      aria-labelledby={`${EXPLORE_SECTION_ID}-heading`}
    >
      <h2 id={`${EXPLORE_SECTION_ID}-heading`} className="sr-only">
        {t("heading")}
      </h2>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}
