"use client";

import type { ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { SECTION_UNITS, type BriefPage } from "@/lib/brief/sections";
import type { SectionId } from "@/lib/brief/selection";

/**
 * The brief as A4 sheets: what the screen shows is what prints. Each sheet
 * carries a running head and a footer; page 1 opens with the title block.
 * Sections sit in fixed-height slots (quarter, half or full page).
 */
export function Sheets({
  pages,
  countryName,
  preparedOn,
  titleBlock,
  renderSection,
}: {
  pages: BriefPage[];
  countryName: string;
  preparedOn: string;
  titleBlock: ReactNode;
  renderSection: (id: SectionId) => ReactNode;
}) {
  const t = useTranslations("brief.sheet");
  const format = useFormatter();
  const date = format.dateTime(new Date(preparedOn), { dateStyle: "long" });
  return (
    <div className="brief-sheets" id="brief-sheets">
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

export function TitleBlock({
  countryName,
  commitments,
  documents,
  comparisons,
  lensName,
  documentNames,
}: {
  countryName: string;
  commitments: number;
  documents: number;
  comparisons: number;
  lensName: string | null;
  documentNames: string[];
}) {
  const t = useTranslations("brief.sheet");
  return (
    <div className="brief-title">
      <p className="brief-title-country">{countryName}</p>
      <p className="brief-title-name">{t("title")}</p>
      <p className="brief-title-scope">
        <span>{t("scope", { commitments, documents, comparisons })}</span>
        {lensName && <span className="brief-title-lens">{t("lensScope", { lens: lensName })}</span>}
      </p>
      <p className="brief-title-method">{t("method")}</p>
      <p className="brief-title-docs">
        <span className="brief-title-docs-label">{t("documentsTitle")}: </span>
        {documentNames.join("; ")}
      </p>
    </div>
  );
}
