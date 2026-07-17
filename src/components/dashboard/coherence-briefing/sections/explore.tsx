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
  return (
    <section
      id={EXPLORE_SECTION_ID}
      className="scroll-mt-24 pt-2"
      aria-labelledby={`${EXPLORE_SECTION_ID}-heading`}
    >
      <h2
        id={`${EXPLORE_SECTION_ID}-heading`}
        className="font-display text-headline sm:text-headline-lg text-[var(--undp-black)] font-medium mb-3"
      >
        {t("heading")}
      </h2>
      <p className="text-body text-[var(--undp-black)] max-w-prose mb-6">
        {t("body")}
      </p>
      {children}
    </section>
  );
}
