"use client";

import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useNumbers } from "./ink";
import { briefDate } from "@/lib/brief/sheet";
import { SECTION_UNITS, type BriefPage } from "@/lib/brief/sections";
import type { SectionId } from "@/lib/brief/selection";

/**
 * The brief as A4 sheets, for printing and the print preview. Each sheet
 * carries a running head and a footer; page 1 opens with the title block.
 * Sections sit in fixed-height slots (quarter, half or full page). While
 * the reader is on the flowing page the sheets stay laid out off screen,
 * so charts and text fits are measured at page size, and inert.
 */
export function Sheets({
  pages,
  countryName,
  preparedOn,
  hidden = false,
  titleBlock,
  renderSection,
}: {
  pages: BriefPage[];
  countryName: string;
  preparedOn: string;
  /** Off screen and out of the accessibility tree (still prints). */
  hidden?: boolean;
  titleBlock: ReactNode;
  renderSection: (id: SectionId) => ReactNode;
}) {
  const t = useTranslations("brief.sheet");
  const date = briefDate(preparedOn, useLocale());
  return (
    <div
      className="brief-sheets"
      id="brief-sheets"
      data-offscreen={hidden ? "true" : undefined}
      aria-hidden={hidden ? true : undefined}
      inert={hidden}
    >
      {pages.map((page, i) => {
        const pageLabel = t("page", { page: i + 1, total: pages.length });
        return (
          <article key={i} className="brief-sheet" data-testid="brief-sheet" aria-label={pageLabel}>
            <header className="brief-sheet-head">
              <span>{t("running", { country: countryName })}</span>
              <span>{pageLabel}</span>
            </header>
            <div className="brief-sheet-body">
              {page.title && <div className="brief-slot brief-units-1">{titleBlock}</div>}
              {page.sections.map((id) => (
                <section
                  key={id}
                  data-section={id}
                  className={`brief-slot brief-units-${SECTION_UNITS[id]}`}
                >
                  {renderSection(id)}
                </section>
              ))}
            </div>
            <footer className="brief-sheet-foot">{t("footer", { date })}</footer>
          </article>
        );
      })}
    </div>
  );
}

/** Page 1's opening: the country, the brief, and its scale in three
 *  figures. How the analysis works lives in the walkthrough and on the
 *  methodology page, not here. */
export function TitleBlock({
  countryName,
  commitments,
  documents,
  comparisons,
  translation,
}: {
  countryName: string;
  commitments: number;
  documents: number;
  comparisons: number;
  /** Set when commitment texts are machine translations or translations of originals. */
  translation?: "machine" | "source" | null;
}) {
  const t = useTranslations("brief.sheet");
  const { n } = useNumbers();
  const figures = [
    { value: documents, label: t("figures.documents", { count: documents }) },
    { value: commitments, label: t("figures.commitments", { count: commitments }) },
    { value: comparisons, label: t("figures.comparisons", { count: comparisons }) },
  ];
  return (
    <div className="brief-title" data-testid="brief-title">
      <p className="brief-title-country">{countryName}</p>
      <p className="brief-title-name">{t("title")}</p>
      <ul className="brief-title-figures">
        {figures.map((f) => (
          <li key={f.label} className="brief-title-figure" data-testid="brief-figure">
            <span className="brief-title-figure-value">{n(f.value)}</span>{" "}
            <span className="brief-title-figure-label">{f.label}</span>
          </li>
        ))}
      </ul>
      {translation && (
        <p className="brief-title-note">
          {t(translation === "machine" ? "translatedMachine" : "translatedSource")}
        </p>
      )}
    </div>
  );
}
