"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { SectionId } from "@/lib/brief/selection";
import { useNumbers } from "./ink";

/**
 * The brief on screen: one flowing page. The same sections as the printed
 * brief, in the reader's order, without page frames, running heads or fixed
 * slot heights; the A4 sheets exist for printing and the print preview.
 */
export function Flow({
  hidden = false,
  countryName,
  commitments,
  documents,
  comparisons,
  translation,
  sections,
  renderSection,
}: {
  /** Hidden while the print preview shows; kept mounted so open rows and
   *  selections survive the round trip. */
  hidden?: boolean;
  countryName: string;
  commitments: number;
  documents: number;
  comparisons: number;
  translation: "machine" | "source" | null;
  sections: SectionId[];
  renderSection: (id: SectionId) => ReactNode;
}) {
  const t = useTranslations("brief.sheet");
  const { n } = useNumbers();
  const figures = [
    { value: documents, label: t("figures.documents", { count: documents }) },
    { value: commitments, label: t("figures.commitments", { count: commitments }) },
    { value: comparisons, label: t("figures.comparisons", { count: comparisons }) },
  ];
  return (
    <main className="brief-flow" data-testid="brief-flow" data-screen-only hidden={hidden}>
      <header className="brief-intro" data-testid="brief-intro">
        <div className="brief-intro-name">
          <p className="brief-intro-country">{countryName}</p>
          <p className="brief-intro-title">{t("title")}</p>
        </div>
        <ul className="brief-intro-figures">
          {figures.map((f) => (
            <li key={f.label}>
              <span className="brief-intro-value">{n(f.value)}</span>{" "}
              <span className="brief-intro-label">{f.label}</span>
            </li>
          ))}
        </ul>
        {translation && (
          <p className="brief-intro-note">
            {t(translation === "machine" ? "translatedMachine" : "translatedSource")}
          </p>
        )}
      </header>
      {sections.map((id) => (
        <section key={id} id={`brief-flow-${id}`} className="brief-flow-section" data-section={id}>
          {renderSection(id)}
        </section>
      ))}
    </main>
  );
}
