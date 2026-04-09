"use client";

import { useState, useMemo, useEffect } from "react";
import type { PolicyDocumentType, Target } from "@/types";
import type { BtrData, UploadedDoc } from "@/lib/upload-helpers";
import type { TargetRow } from "@/lib/csv-parser";
import { getCountry, normaliseCountry } from "@/config/countries";
import { DOC_COLORS } from "@/lib/utils";

type RefData = {
  targets: Target[];
  hasBtr: boolean;
  hasNr7: boolean;
};

interface StepReferenceDataProps {
  country: string;
  btrParsedData: BtrData | null;
  uploadedDocs: UploadedDoc[];
  targetCount: number;
  documentTypeCount: number;
  onAddReferenceTargets: (targets: TargetRow[]) => void;
  onRemoveReferenceTargets: (docType: PolicyDocumentType) => void;
  addedReferenceDocs: Set<PolicyDocumentType>;
  onMarkReferenceAdded: (docType: PolicyDocumentType) => void;
  onMarkReferenceRemoved: (docType: PolicyDocumentType) => void;
  includeBtr: boolean;
  onToggleBtr: () => void;
  includeNr7: boolean;
  onToggleNr7: () => void;
}

function groupByDoc(targets: Target[]) {
  const map = new Map<PolicyDocumentType, Target[]>();
  for (const t of targets) {
    if (!map.has(t.sourceDocument)) map.set(t.sourceDocument, []);
    map.get(t.sourceDocument)!.push(t);
  }
  return Array.from(map, ([docType, tgts]) => ({
    docType,
    count: tgts.length,
    targets: tgts,
  }));
}

const DOC_LABELS: Record<string, string> = {
  NDC: "Nationally Determined Contributions",
  NBSAP: "National Biodiversity Strategy & Action Plan",
  NAP: "National Adaptation Plan",
  LDN: "Land Degradation Neutrality",
  SECTORAL: "Sectoral Policy / Vision",
};

export function StepReferenceData({
  country,
  btrParsedData,
  uploadedDocs,
  targetCount,
  documentTypeCount,
  onAddReferenceTargets,
  onRemoveReferenceTargets,
  addedReferenceDocs,
  onMarkReferenceAdded,
  onMarkReferenceRemoved,
  includeBtr,
  onToggleBtr,
  includeNr7,
  onToggleNr7,
}: StepReferenceDataProps) {
  // Resolve the country to a registry entry at render time. This is pure —
  // free-text country names that don't match a registry entry fall through to
  // the no-data fallback. Hoisted out of the effect so we don't have to
  // setState in the "no entry" branch.
  const countryEntry = useMemo(
    () => (country ? getCountry(normaliseCountry(country)) : undefined),
    [country],
  );
  const countryEntryId =
    countryEntry && countryEntry.has.coherence ? countryEntry.id : null;

  // Cache fetched targets (or an "error" sentinel) keyed by registry id. This
  // lets us derive refData / refLoading at render time without doing any
  // synchronous setState inside the effect body — all writes happen inside
  // the async fetch callbacks.
  const [refCache, setRefCache] = useState<Record<string, RefData | "error">>(
    {},
  );
  const [expandedDoc, setExpandedDoc] = useState<PolicyDocumentType | null>(null);

  const cached = countryEntryId ? refCache[countryEntryId] : undefined;
  const refData: RefData | null = cached && cached !== "error" ? cached : null;
  // "Country selected but nothing cached yet" reads as loading. The fetch
  // resolves (or errors) before this can stay true forever.
  const refLoading = !!countryEntryId && cached === undefined;
  const refGroups = useMemo(
    () => (refData ? groupByDoc(refData.targets) : []),
    [refData],
  );

  // Fetch reference targets from the API whenever the resolved country changes
  // and we haven't already cached a result for it. The API is the single
  // source of truth for the targets; the registry tells us which feature
  // flags (hasBtr, hasNr7) the row blocks below should react to.
  useEffect(() => {
    if (!countryEntryId || !countryEntry) return;
    if (refCache[countryEntryId] !== undefined) return;

    let cancelled = false;
    fetch(`/api/reference-data?country=${encodeURIComponent(countryEntryId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((targets: Target[]) => {
        if (cancelled) return;
        setRefCache((prev) => ({
          ...prev,
          [countryEntryId]: {
            targets,
            hasBtr:
              countryEntry.has.btr.mitigation || countryEntry.has.btr.adaptation,
            hasNr7: countryEntry.has.nr7,
          },
        }));
      })
      .catch(() => {
        if (cancelled) return;
        // 404 (no targets file) or network error: cache an "error" sentinel
        // so we don't refetch and the render falls back to no-data state.
        setRefCache((prev) => ({ ...prev, [countryEntryId]: "error" }));
      });
    return () => {
      cancelled = true;
    };
  }, [countryEntryId, countryEntry, refCache]);

  const btrDocs = uploadedDocs.filter(
    (d) => d.fileType === "btr" && d.status === "ready"
  );

  function handleToggleDocTargets(docType: PolicyDocumentType, targets: Target[]) {
    if (addedReferenceDocs.has(docType)) {
      onRemoveReferenceTargets(docType);
      onMarkReferenceRemoved(docType);
    } else {
      const rows: TargetRow[] = targets.map((t) => ({
        text: t.text,
        sourceDocument: t.sourceDocument,
        sourceLabel: t.sourceLabel,
        source: "file" as const,
        activities: t.activities,
        actions: t.actions,
      }));
      onAddReferenceTargets(rows);
      onMarkReferenceAdded(docType);
    }
  }

  return (
    <div>
      {/* Step header */}
      <div className="mb-8 p-5 bg-gradient-to-r from-teal-50 to-emerald-50 rounded-xl border border-teal-100">
        <h2 className="text-lg font-semibold text-[var(--undp-black)] mb-1.5">
          Available Reference Data
        </h2>
        <p className="text-sm text-[var(--undp-gray)] leading-relaxed max-w-2xl">
          {refData
            ? `Select which pre-loaded data sets for ${country} to include. Toggle items on or off as needed.`
            : "Review any reference data available for your analysis. You can upload BTR data in Step 1."}
        </p>
      </div>

      {/* Progress summary */}
      {targetCount > 0 && (
        <div className="mb-6 px-4 py-3 bg-gray-50 rounded-xl flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[var(--undp-blue)] text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
            {targetCount}
          </div>
          <p className="text-sm text-[var(--undp-black)]">
            target{targetCount !== 1 ? "s" : ""} selected across{" "}
            {documentTypeCount} document type{documentTypeCount !== 1 ? "s" : ""}
          </p>
        </div>
      )}

      {/* Loading skeleton while fetching reference data */}
      {refLoading && (
        <div className="mb-8" aria-busy="true">
          <h3 className="text-xs font-semibold text-[var(--undp-gray)] mb-3 uppercase tracking-wider">
            Policy Targets for {country}
          </h3>
          <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
            {[1, 2, 3].map((i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-3 h-14">
                <div className="w-9 h-9 rounded-lg bg-gray-100 animate-pulse flex-shrink-0" />
                <div className="flex-1">
                  <div className="h-3 w-32 bg-gray-100 rounded animate-pulse mb-1" />
                  <div className="h-2.5 w-20 bg-gray-100 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
          <span className="sr-only">Loading reference data</span>
        </div>
      )}

      {/* Reference targets */}
      {!refLoading && refData && refGroups.length > 0 && (
        <div className="mb-8">
          <h3 className="text-xs font-semibold text-[var(--undp-gray)] mb-3 uppercase tracking-wider">
            Policy Targets for {country}
          </h3>
          <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
            {refGroups.map(({ docType, count, targets }) => {
              const isAdded = addedReferenceDocs.has(docType);
              return (
                <div key={docType}>
                  <div className="px-4 py-3 flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: DOC_COLORS[docType] + "18" }}
                    >
                      <span
                        className="text-[10px] font-bold"
                        style={{ color: DOC_COLORS[docType] }}
                      >
                        {docType.length > 4 ? docType.slice(0, 3) : docType}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--undp-black)]">
                        {docType}
                        <span className="font-normal text-[var(--undp-gray)] ml-1">
                          {DOC_LABELS[docType] ? `\u2014 ${DOC_LABELS[docType]}` : ""}
                        </span>
                      </p>
                      <p className="text-xs text-[var(--undp-gray)]">
                        {count} target{count !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedDoc(expandedDoc === docType ? null : docType)
                      }
                      className="px-2.5 py-1 text-xs rounded-md border border-gray-200 text-[var(--undp-gray)] hover:bg-gray-50"
                    >
                      {expandedDoc === docType ? "Hide" : "Preview"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleDocTargets(docType, targets)}
                      className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                        isAdded
                          ? "bg-emerald-100 text-emerald-700 hover:bg-red-50 hover:text-red-600"
                          : "bg-[var(--undp-blue)] text-white hover:bg-[var(--undp-blue)]/90"
                      }`}
                    >
                      {isAdded ? (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          Added
                        </>
                      ) : (
                        "Add"
                      )}
                    </button>
                  </div>
                  {expandedDoc === docType && (
                    <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3 max-h-40 overflow-y-auto">
                      <div className="space-y-1.5">
                        {targets.slice(0, 8).map((t) => (
                          <p key={t.id} className="text-xs text-[var(--undp-gray)] leading-relaxed">
                            <span className="font-medium text-[var(--undp-black)]">{t.sourceLabel}:</span>{" "}
                            {t.text.length > 140 ? t.text.slice(0, 140) + "..." : t.text}
                          </p>
                        ))}
                        {targets.length > 8 && (
                          <p className="text-xs text-gray-400 italic">
                            + {targets.length - 8} more
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* BTR + NR7 as cards with Add/Remove */}
      {(refData?.hasBtr || refData?.hasNr7 || (btrParsedData && btrDocs.length > 0)) && (
        <div className="mb-8">
          <h3 className="text-xs font-semibold text-[var(--undp-gray)] mb-3 uppercase tracking-wider">
            Additional Data Sources
          </h3>
          <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
            {/* BTR */}
            {(refData?.hasBtr || (btrParsedData && btrDocs.length > 0)) && (
              <div className="px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-violet-600">BTR</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--undp-black)]">
                    BTR Implementation Data
                  </p>
                  <p className="text-xs text-[var(--undp-gray)]">
                    Mitigation measures, emissions, and projections
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onToggleBtr}
                  className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                    includeBtr
                      ? "bg-violet-100 text-violet-700 hover:bg-red-50 hover:text-red-600"
                      : "bg-[var(--undp-blue)] text-white hover:bg-[var(--undp-blue)]/90"
                  }`}
                >
                  {includeBtr ? (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      Added
                    </>
                  ) : (
                    "Add"
                  )}
                </button>
              </div>
            )}
            {/* NR7 */}
            {refData?.hasNr7 && (
              <div className="px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-emerald-600">NR7</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--undp-black)]">
                    NR7 Biodiversity Progress
                  </p>
                  <p className="text-xs text-[var(--undp-gray)]">
                    7th National Report to the CBD (shown on dashboard)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onToggleNr7}
                  className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                    includeNr7
                      ? "bg-emerald-100 text-emerald-700 hover:bg-red-50 hover:text-red-600"
                      : "bg-[var(--undp-blue)] text-white hover:bg-[var(--undp-blue)]/90"
                  }`}
                >
                  {includeNr7 ? (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      Added
                    </>
                  ) : (
                    "Add"
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* No reference data */}
      {!refLoading && !refData && !btrParsedData && targetCount === 0 && (
        <div className="p-6 bg-gray-50 rounded-xl border border-gray-200 text-center">
          <p className="text-sm text-[var(--undp-gray)] mb-1">
            No pre-loaded reference data for this country.
          </p>
          <p className="text-xs text-gray-400">
            Continue to the next step, or go back to upload your own documents.
          </p>
        </div>
      )}
    </div>
  );
}
