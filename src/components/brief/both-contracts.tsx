"use client";

import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { routing } from "@/i18n/routing";
import type { ServingBoth } from "@/lib/brief/contracts/both";
import { useMoney } from "./contracts/money";

/** Rows shown before "Show all". */
const PREVIEW = 5;

/**
 * Under a potential misalignment's comparison: the public contracts that
 * already serve both targets, largest first, each opening in the contracts
 * page's panel. Money marks are UNDP blue, as on the contracts page.
 */
export function BothContracts({ both, countryId }: { both: ServingBoth; countryId: string }) {
  const t = useTranslations("brief.panel");
  const tc = useTranslations("brief.contracts.panel");
  const m = useMoney();
  const locale = useLocale();
  // As the brief's other links: English URLs carry no locale prefix.
  const base = `${locale === routing.defaultLocale ? "" : `/${locale}`}/${countryId}/brief/contracts`;
  const heading = useId();
  const [all, setAll] = useState(false);
  const shown = all ? both.contracts : both.contracts.slice(0, PREVIEW);
  return (
    <section className="brief-panel-note brief-both" aria-labelledby={heading}>
      <h4 id={heading} className="brief-panel-note-label">
        {t("bothHeading")}
      </h4>
      <p className="brief-panel-meta">{t("bothCount", { count: both.contracts.length, value: m.amount(both.value) })}</p>
      <ul className="brief-panel-rows">
        {shown.map((c) => (
          <li key={c.id} className="brief-panel-row">
            <a href={`${base}?contract=${encodeURIComponent(c.id)}`}>
              <span className="brief-panel-mark brief-panel-mark-money" aria-hidden="true" />
              <span className="brief-panel-row-main">
                <span className="brief-panel-row-line">{c.title}</span>
                <span className="brief-panel-row-type">{t("bothItem", { value: m.amount(c.value), year: String(c.year) })}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
      {!all && both.contracts.length > PREVIEW && (
        <button type="button" className="brief-panel-more brief-panel-show-all" onClick={() => setAll(true)}>
          {t("showAll", { count: both.contracts.length })}
        </button>
      )}
      <p className="brief-panel-caveat">{tc("caveat")}</p>
    </section>
  );
}
