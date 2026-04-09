"use client";

import { useState, useMemo } from "react";
import { ALIGNMENT_COLORS, ALIGNMENT_LABELS, CONTRADICTION_TYPE_LABELS, getDocColor, getDocLabel } from "@/lib/utils";
import { InfoBox } from "@/components/ui/info-box";
import { isContradiction } from "@/types";
import type { AlignmentResult, AlignmentLevel, CountryConfig, Target, ContradictionType, PolicyDocumentType } from "@/types";

interface ContradictionSummaryProps {
  alignmentData: AlignmentResult[];
  targets: Target[];
  countryConfig?: CountryConfig | null;
}

const SEVERITY_ORDER: AlignmentLevel[] = [
  "high_contradiction",
  "moderate_contradiction",
  "low_tension",
];

/**
 * Dedicated panel showing policy contradictions sorted by severity,
 * grouped by contradiction type, and filterable by document type.
 */
export function ContradictionSummary({
  alignmentData,
  targets,
  countryConfig,
}: ContradictionSummaryProps) {
  const [expanded, setExpanded] = useState(false);
  const [filterType, setFilterType] = useState<ContradictionType | "all">("all");
  const [filterDoc, setFilterDoc] = useState<PolicyDocumentType | "all">("all");

  const targetMap = useMemo(
    () => new Map(targets.map((t) => [t.id, t])),
    [targets]
  );

  const contradictions = useMemo(() => {
    return alignmentData
      .filter((a) => isContradiction(a.alignment))
      .sort((a, b) => {
        const aIdx = SEVERITY_ORDER.indexOf(a.alignment);
        const bIdx = SEVERITY_ORDER.indexOf(b.alignment);
        return aIdx - bIdx;
      });
  }, [alignmentData]);

  const documentTypes = useMemo(() => {
    const types = new Set<PolicyDocumentType>();
    for (const t of targets) types.add(t.sourceDocument);
    return Array.from(types);
  }, [targets]);

  const contradictionTypes = useMemo(() => {
    const types = new Set<ContradictionType>();
    for (const c of contradictions) {
      if (c.contradictionType) types.add(c.contradictionType);
    }
    return Array.from(types);
  }, [contradictions]);

  const filtered = useMemo(() => {
    return contradictions.filter((c) => {
      if (filterType !== "all" && c.contradictionType !== filterType) return false;
      if (filterDoc !== "all") {
        const tA = targetMap.get(c.targetAId);
        const tB = targetMap.get(c.targetBId);
        if (tA?.sourceDocument !== filterDoc && tB?.sourceDocument !== filterDoc) return false;
      }
      return true;
    });
  }, [contradictions, filterType, filterDoc, targetMap]);

  const typeCounts = useMemo(() => {
    const counts: Partial<Record<ContradictionType, number>> = {};
    for (const c of filtered) {
      if (c.contradictionType) {
        counts[c.contradictionType] = (counts[c.contradictionType] ?? 0) + 1;
      }
    }
    return counts;
  }, [filtered]);

  if (contradictions.length === 0) return null;

  return (
    <section id="contradictions" className="mb-10">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--undp-black)]">
            Policy Contradictions
            <InfoBox>
              Contradictions are cases where policy targets may work against each other.
              <br /><br />
              <strong>Goal conflict:</strong> targets aim for incompatible outcomes.<br />
              <strong>Resource competition:</strong> targets compete for the same resources.<br />
              <strong>Implementation tension:</strong> implementing one target makes the other harder.<br />
              <strong>Scale/scope mismatch:</strong> targets operate at incompatible scales.
            </InfoBox>
          </h2>
          <p className="text-sm text-[var(--undp-gray)] mt-1">
            {contradictions.length} potential contradiction{contradictions.length !== 1 ? "s" : ""} detected across policy targets.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 mt-1 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--undp-blue)] border border-[var(--undp-blue)]/30 rounded-lg hover:bg-[var(--undp-blue)]/5 transition-colors"
        >
          {expanded ? "Hide" : "Details"}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`transition-transform ${expanded ? "rotate-180" : ""}`}>
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {!expanded ? null : <>

      {/* Type summary badges */}
      <div className="flex flex-wrap gap-2 mb-4">
        {contradictionTypes.map((type) => (
          <span
            key={type}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200"
          >
            {CONTRADICTION_TYPE_LABELS[type]}
            <span className="bg-red-100 text-red-800 px-1.5 py-0.5 rounded-full text-[11px]">
              {typeCounts[type] ?? 0}
            </span>
          </span>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as ContradictionType | "all")}
          className="text-xs border border-gray-200 rounded px-2 py-1.5 bg-white text-[var(--undp-black)]"
        >
          <option value="all">All contradiction types</option>
          {contradictionTypes.map((type) => (
            <option key={type} value={type}>
              {CONTRADICTION_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        <select
          value={filterDoc}
          onChange={(e) => setFilterDoc(e.target.value as PolicyDocumentType | "all")}
          className="text-xs border border-gray-200 rounded px-2 py-1.5 bg-white text-[var(--undp-black)]"
        >
          <option value="all">All document types</option>
          {documentTypes.map((dt) => (
            <option key={dt} value={dt}>
              {getDocLabel(countryConfig, dt)}
            </option>
          ))}
        </select>
        {(filterType !== "all" || filterDoc !== "all") && (
          <button
            type="button"
            onClick={() => { setFilterType("all"); setFilterDoc("all"); }}
            className="text-xs text-[var(--undp-blue)] hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.map((c) => {
          const tA = targetMap.get(c.targetAId);
          const tB = targetMap.get(c.targetBId);
          if (!tA || !tB) return null;

          return (
            <div
              key={`${c.targetAId}__${c.targetBId}`}
              className="bg-white border border-gray-100 rounded-lg p-4"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: ALIGNMENT_COLORS[c.alignment] }}
                  />
                  <span
                    className="text-xs font-semibold"
                    style={{ color: ALIGNMENT_COLORS[c.alignment] }}
                  >
                    {ALIGNMENT_LABELS[c.alignment]}
                  </span>
                  {c.contradictionType && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                      {CONTRADICTION_TYPE_LABELS[c.contradictionType]}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
                <div className="flex gap-2 items-start">
                  <span
                    className="shrink-0 inline-block px-1.5 py-0.5 rounded text-[11px] font-medium text-white mt-0.5"
                    style={{ backgroundColor: getDocColor(countryConfig, tA.sourceDocument) }}
                  >
                    {getDocLabel(countryConfig, tA.sourceDocument)}
                  </span>
                  <div>
                    <p className="text-xs font-medium text-[var(--undp-black)]">
                      {tA.sourceLabel}
                    </p>
                    <p className="text-xs text-[var(--undp-gray)] leading-relaxed mt-0.5">
                      {tA.text}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 items-start">
                  <span
                    className="shrink-0 inline-block px-1.5 py-0.5 rounded text-[11px] font-medium text-white mt-0.5"
                    style={{ backgroundColor: getDocColor(countryConfig, tB.sourceDocument) }}
                  >
                    {getDocLabel(countryConfig, tB.sourceDocument)}
                  </span>
                  <div>
                    <p className="text-xs font-medium text-[var(--undp-black)]">
                      {tB.sourceLabel}
                    </p>
                    <p className="text-xs text-[var(--undp-gray)] leading-relaxed mt-0.5">
                      {tB.text}
                    </p>
                  </div>
                </div>
              </div>

              {c.description && (
                <p className="text-xs text-[var(--undp-gray)] leading-relaxed border-t border-gray-50 pt-2 mt-2">
                  {c.description}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && contradictions.length > 0 && (
        <p className="text-sm text-[var(--undp-gray)] text-center py-8">
          No contradictions match the current filters.
        </p>
      )}

      </>}
    </section>
  );
}
