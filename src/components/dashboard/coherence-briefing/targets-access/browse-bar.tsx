"use client";

/**
 * TargetsBrowseBar — the front door to the commitments themselves.
 *
 * WHY THIS EXISTS: a good per-document target browser already existed
 * (`DocTargetsDrawer`), but every route into it was a hover or an expand — the
 * wheel legend's hover card, the collapsed inspect-and-adjust panel, the
 * Doc-in-Focus title popover. Readers reported that they could not get at the
 * targets in totality, and the reason was that nothing on the page said the
 * word "targets" until you had already gone looking for it. This is a visible,
 * always-on row of documents with their counts; every chip opens the same
 * drawer that already existed.
 *
 * It deliberately adds no new browsing concept. If this component is deleted,
 * the three original routes still work.
 *
 * Ordered by national hierarchy (`@/lib/doc-taxonomy`) so it reads in the same
 * sequence as the legend beside it, with the reported-action and budget-line
 * stand-ins last — they are what the analysis compares the policy commitments
 * against, not commitments themselves, and the bar labels them as such.
 */

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { getDocColor, getDocMediumLabel } from "@/lib/utils";
import { docTierSortKey, getDocTier, hasDocTaxonomy } from "@/lib/doc-taxonomy";
import type { CountryConfig, PolicyDocumentType } from "@/types";
import { TARGETS_BROWSE_BAR } from "./config";

/** Reserved stand-in tokens, which sort after every policy document. */
const STAND_INS: Record<string, "reportedAction" | "budgetLine"> = {
  BTR: "reportedAction",
  BTR_ADP: "reportedAction",
  BER: "budgetLine",
};

export function TargetsBrowseBar({
  allDocs,
  countryConfig,
  targetCountByDoc,
  onViewTargets,
}: {
  /** Every document with rows to browse, INCLUDING the BTR / BER stand-ins.
   *  Distinct from the briefing's analytical document set on purpose: this
   *  changes what you can browse, never what gets compared. */
  allDocs: PolicyDocumentType[];
  countryConfig: CountryConfig | null;
  targetCountByDoc: Map<PolicyDocumentType, number>;
  onViewTargets: (doc: PolicyDocumentType) => void;
}) {
  const t = useTranslations("briefing.browseTargets");

  const docs = useMemo(() => {
    const withRows = allDocs.filter((d) => (targetCountByDoc.get(d) ?? 0) > 0);
    const tiered = hasDocTaxonomy(countryConfig);
    return [...withRows].sort((a, b) => {
      // Stand-ins always last, whatever the country declared.
      const sa = a in STAND_INS ? 1 : 0;
      const sb = b in STAND_INS ? 1 : 0;
      if (sa !== sb) return sa - sb;
      if (tiered) {
        const ka = docTierSortKey(countryConfig, a, allDocs.indexOf(a));
        const kb = docTierSortKey(countryConfig, b, allDocs.indexOf(b));
        if (ka !== kb) return ka - kb;
      }
      return allDocs.indexOf(a) - allDocs.indexOf(b);
    });
  }, [allDocs, countryConfig, targetCountByDoc]);

  if (!TARGETS_BROWSE_BAR || docs.length === 0) return null;

  // No lead sentence: the overview band's corpus tile already states the
  // totals, and the chips carry their own counts — the row introduces itself.
  return (
    <div className="mt-3">
      <ul className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {docs.map((doc) => {
          const standIn = STAND_INS[doc];
          const count = targetCountByDoc.get(doc) ?? 0;
          const label = standIn
            ? t(standIn === "budgetLine" ? "budgetLine" : "reportedAction")
            : getDocMediumLabel(countryConfig, doc);
          const tier = getDocTier(countryConfig, doc);
          return (
            <li key={doc}>
              <button
                type="button"
                onClick={() => onViewTargets(doc)}
                aria-label={t("chipAria", { name: label, count })}
                className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-2.5 py-0.5 text-caption text-[var(--undp-black)] transition-colors hover:border-[var(--undp-blue)] hover:text-[var(--undp-blue)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--undp-blue)] focus-visible:ring-offset-1"
                title={
                  tier !== undefined && !standIn
                    ? getDocMediumLabel(countryConfig, doc)
                    : undefined
                }
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: getDocColor(countryConfig, doc) }}
                />
                <span>{label}</span>
                <span className="tabular-nums text-[var(--undp-gray)]">
                  {count}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
