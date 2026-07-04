"use client";

import { useTranslations } from "next-intl";
import { GLOBE_CATEGORIES_COUNT } from "@/lib/upload-helpers";
import { GGA_CATEGORY_COUNT } from "@/data/active-taxonomies";

interface AnalysisEstimateProps {
  targetCount: number;
  activeNbsCount: number;
  activeSectorsCount: number;
  estimate: {
    totalCalls: number;
    estCost: number;
    estPairs: number;
    docTypes: number;
  } | null;
  hasBtrData: boolean;
  submitting: boolean;
  onRunAnalysis: () => void;
}

export function AnalysisEstimate({
  targetCount,
  activeNbsCount,
  activeSectorsCount,
  estimate,
  hasBtrData,
  submitting,
  onRunAnalysis,
}: AnalysisEstimateProps) {
  const t = useTranslations("upload.estimate");
  // Matches the pipeline's actual call plan: active taxonomies only (a paused
  // taxonomy contributes 0 via its empty group) plus the fixed GGA lens.
  const classCalls =
    targetCount * (activeNbsCount + activeSectorsCount + GLOBE_CATEGORIES_COUNT + GGA_CATEGORY_COUNT);

  return (
    <div className="bg-[var(--undp-light)] rounded-lg p-5 mb-8">
      <div className="flex items-start justify-between gap-6">
        <div className="flex-1 min-w-0">
          <ul className="space-y-1 text-sm text-[var(--undp-gray)] mb-3">
            <li>&middot; {t("quantitative", { count: targetCount })}</li>
            <li>&middot; {t("classification", { count: classCalls })}</li>
            <li>&middot; {t("decomposition", { count: targetCount })}</li>
            <li>
              &middot;{" "}
              {(estimate?.docTypes ?? 0) < 2
                ? t("needsTwoDocs")
                : t("pairwiseCount", { count: estimate?.estPairs ?? 0 })}
            </li>
            {hasBtrData && <li>&middot; {t("btrIntegration")}</li>}
          </ul>
          {(estimate?.docTypes ?? 0) < 2 && (
            <p className="text-amber-600 text-xs">{t("addSecondDoc")}</p>
          )}
          {estimate && (
            <p className="text-xs text-[var(--undp-gray)]">
              {t.rich("totalCost", {
                calls: estimate.totalCalls,
                cost: estimate.estCost.toFixed(2),
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
          )}
        </div>
        <div className="shrink-0">
          <button
            onClick={onRunAnalysis}
            disabled={submitting}
            className="px-6 py-2.5 bg-[var(--undp-blue)] text-white text-sm font-medium rounded-md hover:bg-[var(--undp-blue-dark)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {submitting ? t("starting") : t("runAnalysis")}
          </button>
        </div>
      </div>
    </div>
  );
}
