"use client";

import { useState } from "react";
import { DOC_COLORS, DOC_LABELS } from "@/lib/utils";
import { TargetTextWithHighlights } from "./target-text";
import type { Target, PolicyDocumentType } from "@/types";

interface StatCardProps {
  value: number;
  label: string;
  color: string;
  targets?: Target[];
}

function StatCard({ value, label, color, targets }: StatCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  const isClickable = targets && targets.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => isClickable && setIsOpen(true)}
        className={`bg-[var(--undp-light)] border border-gray-100 p-5 text-left w-full h-full transition-colors ${
          isClickable ? "hover:bg-gray-200/60 cursor-pointer" : "cursor-default"
        }`}
      >
        <p className="text-2xl md:text-3xl font-medium tabular-nums" style={{ color }}>
          {value}
        </p>
        <p className="text-xs text-[var(--undp-gray)] mt-1 leading-snug">
          {label}
        </p>
        {isClickable && (
          <p className="text-[10px] text-[var(--undp-gray)]/70 mt-1">
            Click to view
          </p>
        )}
      </button>

      {isOpen && targets && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-medium text-[var(--undp-black)]">
                {label} ({targets.length})
              </h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-[var(--undp-gray)] hover:text-[var(--undp-black)] text-xl leading-none"
              >
                x
              </button>
            </div>
            <div className="overflow-auto flex-1 px-6 py-4">
              <ul className="space-y-3">
                {targets.map((t) => (
                  <li
                    key={t.id}
                    className="flex gap-3 text-sm py-2 border-b border-gray-50 last:border-0"
                  >
                    <span
                      className="shrink-0 inline-block px-2 py-0.5 rounded text-xs font-medium text-white"
                      style={{ backgroundColor: DOC_COLORS[t.sourceDocument] }}
                    >
                      {DOC_LABELS[t.sourceDocument]} {t.sourceLabel}
                    </span>
                    <span className="text-[var(--undp-black)] leading-relaxed">
                      <TargetTextWithHighlights target={t} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Full labels for document types in stat cards */
const DOC_FULL_LABELS: Record<PolicyDocumentType, string> = {
  NDC: "Nationally Determined Contributions",
  NBSAP: "National Biodiversity Targets",
  NAP: "National Adaptation Plan Targets",
  LDN: "Land Degradation Neutrality Targets",
  SECTORAL: "Sectoral Policy Targets",
  BTR: "BTR Reported Measures",
  OTHER: "Other Targets",
};

interface DashboardStatsProps {
  targets: Target[];
  alignmentCount: number;
  contradictionCount: number;
}

export function DashboardStats({
  targets,
  alignmentCount,
  contradictionCount,
}: DashboardStatsProps) {
  const targetsByDoc = new Map<PolicyDocumentType, Target[]>();
  for (const t of targets) {
    const list = targetsByDoc.get(t.sourceDocument) || [];
    list.push(t);
    targetsByDoc.set(t.sourceDocument, list);
  }

  const docTypes = Array.from(targetsByDoc.keys());
  const colCount = docTypes.length + 2;

  return (
    <section
      className="grid gap-3 mb-10"
      style={{
        gridTemplateColumns: `repeat(${Math.min(colCount, 6)}, minmax(0, 1fr))`,
      }}
    >
      <StatCard
        value={targets.length}
        label={`targets from ${docTypes.length} source${docTypes.length !== 1 ? "s" : ""}`}
        color="var(--undp-blue, #0468b1)"
        targets={targets}
      />
      {docTypes.map((docType) => {
        const docTargets = targetsByDoc.get(docType) ?? [];
        return (
          <StatCard
            key={docType}
            value={docTargets.length}
            label={DOC_FULL_LABELS[docType]}
            color={DOC_COLORS[docType]}
            targets={docTargets}
          />
        );
      })}
      <StatCard
        value={alignmentCount}
        label="Alignment Opportunities"
        color="var(--chart-alignment, #196127)"
      />
      {contradictionCount > 0 && (
        <StatCard
          value={contradictionCount}
          label="Contradictions Found"
          color="#b91c1c"
        />
      )}
    </section>
  );
}
