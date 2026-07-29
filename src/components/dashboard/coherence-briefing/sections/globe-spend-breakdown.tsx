"use client";

/**
 * Reviewed spend by GLOBE category — compact breakdown block under the
 * financing dot grid.
 *
 * Deliberately NOT a pivot of the per-target dot grid: the grid is
 * per-target and rank-based, while GLOBE categories are per-programme
 * (single primary label). Mixing the two modes in one visual would weight
 * them as if comparable. This block reads straight from
 * CategoryBudgetSummary, so each programme counts exactly once under its
 * primary category — no overlap with the per-target aligned-spend figures.
 *
 * Category tags are Tracker-AI-assigned from programme descriptions, not the
 * national BIOFIN team's classification; the caption below the rows says so.
 */

import { useTranslations } from "next-intl";
import type { CategoryBudgetSummary } from "@/lib/coherence-budget";
import { InfoBox } from "@/components/ui/info-box";
import { fmtMoney } from "./funding-target-grid";

export function GlobeSpendBreakdown({
  summary,
}: {
  summary: CategoryBudgetSummary;
}) {
  const t = useTranslations("briefing.financing.globeBreakdown");
  const funded = summary.entries
    .filter((e) => e.totalBudget > 0)
    .sort((a, b) => b.totalBudget - a.totalBudget);
  const emptyCount = summary.entries.length - funded.length;
  if (funded.length === 0) return null;
  const maxShare = Math.max(summary.maxShare, 0.0001);

  return (
    <div className="mt-6">
      <h3 className="text-body font-medium text-[var(--undp-black)] mb-2">
        {t("title")}
        <InfoBox>{t("info")}</InfoBox>
      </h3>
      <ul className="space-y-1.5">
        {funded.map((e) => (
          <li
            key={e.categoryId}
            className="grid grid-cols-[minmax(140px,1fr)_2fr_auto] items-center gap-3 text-caption"
          >
            <span className="text-[var(--undp-black)] truncate" title={e.categoryName}>
              {e.categoryName}
            </span>
            <span
              aria-hidden="true"
              className="h-1.5 rounded-full bg-[var(--undp-blue)]"
              style={{
                width: `${Math.max((e.shareOfTotalBudget / maxShare) * 100, 2)}%`,
                opacity: 0.85,
              }}
            />
            <span className="tabular-nums text-[var(--undp-gray)] whitespace-nowrap">
              {fmtMoney(e.totalBudget, summary.unit, summary.currency)} ·{" "}
              {Math.round(e.shareOfTotalBudget * 100)}%
            </span>
          </li>
        ))}
      </ul>
      {emptyCount > 0 && (
        <p className="text-caption text-[var(--undp-gray)] mt-2">
          {t("noSpendCategories", { count: emptyCount })}
        </p>
      )}
      <p className="text-caption italic text-[var(--undp-gray)] mt-2 max-w-prose">
        {t("aiCaption")}
      </p>
    </div>
  );
}
