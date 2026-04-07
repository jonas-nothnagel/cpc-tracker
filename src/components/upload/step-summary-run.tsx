"use client";

import { useState } from "react";
import type { PolicyDocumentType } from "@/types";
import type { TargetRow } from "@/lib/csv-parser";
import type { TaxonomyGroup } from "@/hooks/useCategories";
import { DOC_COLORS } from "@/lib/utils";
import { formatFootprintValue } from "@/lib/footprint";
import { AnalysisEstimate } from "./analysis-estimate";

interface StepSummaryRunProps {
  country: string;
  targets: TargetRow[];
  targetsByDocument: {
    docType: PolicyDocumentType;
    targets: { t: TargetRow; idx: number }[];
  }[];
  groups: TaxonomyGroup[];
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
  submitError: string | null;
  onRunAnalysis: () => void;
  extractionFootprint?: {
    energy_wh: number;
    water_ml: number;
    co2_geq: number;
    minerals_ugsbeq: number;
    call_count: number;
  };
}

export function StepSummaryRun({
  country,
  targets,
  targetsByDocument,
  groups,
  activeNbsCount,
  activeSectorsCount,
  estimate,
  hasBtrData,
  submitting,
  submitError,
  onRunAnalysis,
  extractionFootprint,
}: StepSummaryRunProps) {
  const [expandedDoc, setExpandedDoc] = useState<PolicyDocumentType | null>(null);

  return (
    <div>
      {/* Step header */}
      <div className="mb-8 p-5 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-100">
        <h2 className="text-lg font-semibold text-[var(--undp-black)] mb-1.5">
          Summary & Run Analysis
        </h2>
        <p className="text-sm text-[var(--undp-gray)] leading-relaxed max-w-2xl">
          Review your complete analysis configuration below. The pipeline will classify each
          target, decompose its structure, and assess pairwise alignment across all document types.
        </p>
      </div>

      {/* Overview grid */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="p-4 border border-gray-200 rounded-xl">
          <p className="text-[10px] font-semibold text-[var(--undp-gray)] uppercase tracking-wider mb-2">Country</p>
          <p className="text-lg font-semibold text-[var(--undp-black)]">{country || "Not specified"}</p>
        </div>
        <div className="p-4 border border-gray-200 rounded-xl">
          <p className="text-[10px] font-semibold text-[var(--undp-gray)] uppercase tracking-wider mb-2">Targets</p>
          <p className="text-lg font-semibold text-[var(--undp-black)]">
            {targets.length}
            <span className="text-sm font-normal text-[var(--undp-gray)] ml-1.5">
              across {targetsByDocument.length} document type{targetsByDocument.length !== 1 ? "s" : ""}
            </span>
          </p>
        </div>
      </div>

      {/* Per-document breakdown */}
      <div className="mb-6 border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
          <p className="text-[10px] font-semibold text-[var(--undp-gray)] uppercase tracking-wider">Target Breakdown</p>
        </div>
        <div className="divide-y divide-gray-100">
          {targetsByDocument.map(({ docType, targets: docTargets }) => (
            <div key={docType}>
              <button type="button" onClick={() => setExpandedDoc(expandedDoc === docType ? null : docType)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: DOC_COLORS[docType] }} />
                <span className="text-sm font-medium text-[var(--undp-black)] flex-1 text-left">{docType}</span>
                <span className="text-sm text-[var(--undp-gray)] tabular-nums">{docTargets.length}</span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${expandedDoc === docType ? "rotate-180" : ""}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedDoc === docType && (
                <div className="px-4 pb-3 ml-6 space-y-1.5 max-h-48 overflow-y-auto">
                  {docTargets.map(({ t, idx }) => (
                    <p key={idx} className="text-xs text-[var(--undp-gray)] leading-relaxed">
                      <span className="font-medium text-[var(--undp-black)]">{t.sourceLabel}:</span>{" "}
                      {t.text.length > 120 ? t.text.slice(0, 120) + "..." : t.text}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Category groups */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {groups.map((g) => {
          const active = g.items.filter((c) => c.enabled).length;
          return (
            <div key={g.id} className="p-3 border border-gray-200 rounded-xl">
              <p className="text-xl font-bold text-[var(--undp-black)]">{active}</p>
              <p className="text-xs text-[var(--undp-gray)] mt-0.5">{g.name}</p>
            </div>
          );
        })}
      </div>

      {/* BTR */}
      {hasBtrData && (
        <div className="mb-6 p-4 border border-violet-200 rounded-xl bg-violet-50/30 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-violet-600">BTR</span>
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--undp-black)]">BTR implementation data included</p>
            <p className="text-xs text-[var(--undp-gray)]">Mitigation measures compared against policy targets.</p>
          </div>
        </div>
      )}

      {extractionFootprint && extractionFootprint.call_count > 0 && (
        <div className="mb-4 p-4 border border-gray-200 rounded-xl bg-gray-50/60">
          <p className="text-[10px] font-semibold text-[var(--undp-gray)] uppercase tracking-wider mb-2">
            Document extraction footprint so far
          </p>
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span className="text-sm">
              <strong className="text-[var(--undp-black)]">
                {formatFootprintValue(extractionFootprint.energy_wh)}
              </strong>{" "}
              Wh energy
            </span>
            <span className="text-gray-300">·</span>
            <span className="text-sm">
              <strong className="text-[var(--undp-black)]">
                {formatFootprintValue(extractionFootprint.water_ml)}
              </strong>{" "}
              mL water
            </span>
            <span className="text-gray-300">·</span>
            <span className="text-sm">
              <strong className="text-[var(--undp-black)]">
                {formatFootprintValue(extractionFootprint.co2_geq)}
              </strong>{" "}
              gCO<sub>2</sub>eq
            </span>
            <span className="text-gray-300">·</span>
            <span className="text-sm">
              <strong className="text-[var(--undp-black)]">
                {formatFootprintValue(extractionFootprint.minerals_ugsbeq)}
              </strong>{" "}
              µgSbeq minerals
            </span>
          </div>
          <p className="text-[11px] text-[var(--undp-gray)] mt-2 leading-snug">
            Accumulated from {extractionFootprint.call_count.toLocaleString()}{" "}
            LLM calls during extraction. This will be added to the analysis
            footprint on the final dashboard. Estimated via EcoLogits.
          </p>
        </div>
      )}

      {submitError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm text-red-700">{submitError}</p>
        </div>
      )}

      <AnalysisEstimate
        targetCount={targets.length}
        activeNbsCount={activeNbsCount}
        activeSectorsCount={activeSectorsCount}
        estimate={estimate}
        hasBtrData={hasBtrData}
        submitting={submitting}
        onRunAnalysis={onRunAnalysis}
      />
    </div>
  );
}
