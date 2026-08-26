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
  // The Explore finale is a self-contained workbench: it owns its own title,
  // stat line, and controls in a top bar, so the section heading and intro
  // fold into that chrome and stay only as an accessible landmark. Height is
  // content-driven (the wheel sizes by width, capped), so the section can be
  // taller than one screen on laptops; a bigger wheel beats a one-screen fit.
  // The nav publishes its live height as --jump-nav-clearance (see JumpNav),
  // so the anchor landing tracks however many rows the nav currently wraps to.
  return (
    <section
      id={EXPLORE_SECTION_ID}
      className="scroll-mt-[var(--jump-nav-clearance,10.25rem)]"
      aria-labelledby={`${EXPLORE_SECTION_ID}-heading`}
    >
      <h2 id={`${EXPLORE_SECTION_ID}-heading`} className="sr-only">
        {t("heading")}
      </h2>
      {children}
    </section>
  );
}
