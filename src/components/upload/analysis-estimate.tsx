"use client";

import { CROSS_CUTTING_THEMES_COUNT } from "@/lib/upload-helpers";

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
  const classCalls = targetCount * (activeNbsCount + activeSectorsCount + CROSS_CUTTING_THEMES_COUNT);

  return (
    <div className="bg-[var(--undp-light)] rounded-lg p-5 mb-8">
      <div className="flex items-start justify-between gap-6">
        <div className="flex-1 min-w-0">
          <ul className="space-y-1 text-sm text-[var(--undp-gray)] mb-3">
            <li>&middot; Quantitative phrase detection: {targetCount} calls</li>
            <li>&middot; Classification against NBS, IPCC, themes: {classCalls} calls</li>
            <li>&middot; Target decomposition: {targetCount} calls</li>
            <li>
              &middot; Pairwise alignment:{" "}
              {(estimate?.docTypes ?? 0) < 2
                ? "requires 2+ document types"
                : `~${estimate?.estPairs ?? 0} pairs`}
            </li>
            {hasBtrData && <li>&middot; BTR/CTF data integration</li>}
          </ul>
          {(estimate?.docTypes ?? 0) < 2 && (
            <p className="text-amber-600 text-xs">
              Add targets from a second document type (e.g. NDC + NBSAP) to enable alignment analysis.
            </p>
          )}
          {estimate && (
            <p className="text-xs text-[var(--undp-gray)]">
              ~{estimate.totalCalls.toLocaleString()} LLM calls &middot; estimated cost{" "}
              <strong>${estimate.estCost.toFixed(2)}</strong>
            </p>
          )}
        </div>
        <div className="shrink-0">
          <button
            onClick={onRunAnalysis}
            disabled={submitting}
            className="px-6 py-2.5 bg-[var(--undp-blue)] text-white text-sm font-medium rounded-md hover:bg-[var(--undp-blue-dark)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {submitting ? "Starting..." : "Run analysis \u2192"}
          </button>
        </div>
      </div>
    </div>
  );
}
