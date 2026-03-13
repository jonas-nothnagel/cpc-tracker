"use client";

import { useState } from "react";
import { DOC_COLORS, DOC_LABELS } from "@/lib/utils";
import { TargetTextWithHighlights } from "./target-text";
import type { Target, PolicyDocumentType, BtrData, Nr7Data } from "@/types";

const DOC_FULL_LABELS: Record<PolicyDocumentType, string> = {
  NDC: "Nationally Determined Contribution",
  NBSAP: "National Biodiversity Strategy & Action Plan",
  NAP: "National Adaptation Plan",
  LDN: "Land Degradation Neutrality",
  SECTORAL: "Sectoral Policy",
  BTR: "Biennial Transparency Report",
  OTHER: "Other Policy Document",
};

// ─── Target list modal ────────────────────────────────────────────────────────

function TargetListModal({ label, targets, color, onClose }: {
  label: string; targets: Target[]; color: string; onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-xl w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
            <span className="text-sm font-semibold text-[var(--undp-black)]">{label}</span>
            <span className="text-xs text-[var(--undp-gray)] bg-gray-100 px-1.5 py-0.5 rounded-full">
              {targets.length}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-[var(--undp-gray)] hover:bg-gray-100 hover:text-[var(--undp-black)] transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>
        <ul className="overflow-y-auto flex-1 divide-y divide-gray-50 px-5 py-2">
          {targets.map((t) => (
            <li key={t.id} className="py-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold text-white leading-none"
                  style={{ backgroundColor: DOC_COLORS[t.sourceDocument] }}
                >
                  {DOC_LABELS[t.sourceDocument]}
                </span>
                <span className="text-xs font-medium text-[var(--undp-black)]">
                  {t.sourceLabel}
                </span>
              </div>
              <p className="text-sm text-[var(--undp-gray)] leading-relaxed">
                <TargetTextWithHighlights target={t} />
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

interface DataSourcesOverviewProps {
  targets: Target[];
  alignmentOpportunities: number;
  btrData: BtrData | null;
  nr7Data?: Nr7Data | null;
}

export function DataSourcesOverview({ targets, btrData, nr7Data }: DataSourcesOverviewProps) {
  const [modal, setModal] = useState<{ label: string; targets: Target[]; color: string } | null>(null);

  const targetsByDoc = new Map<PolicyDocumentType, Target[]>();
  for (const t of targets) {
    const list = targetsByDoc.get(t.sourceDocument) ?? [];
    list.push(t);
    targetsByDoc.set(t.sourceDocument, list);
  }
  const docTypes = Array.from(targetsByDoc.keys()).sort((a, b) => {
    const order: PolicyDocumentType[] = ["NDC", "NBSAP", "NAP", "LDN", "SECTORAL", "BTR", "OTHER"];
    return order.indexOf(a) - order.indexOf(b);
  });

  const btrMeasures = btrData?.mitigationMeasures.length ?? 0;
  const nr7Count = nr7Data?.progressItems.length ?? 0;

  type SourceEntry = {
    key: string;
    name: string;
    detail: string;
    color: string;
    badge: string;
    onClick?: () => void;
  };

  const sources: SourceEntry[] = [];
  for (const docType of docTypes) {
    const docTargets = targetsByDoc.get(docType) ?? [];
    sources.push({
      key: `doc:${docType}`,
      name: DOC_FULL_LABELS[docType],
      detail: `${docTargets.length} target${docTargets.length === 1 ? "" : "s"}`,
      color: DOC_COLORS[docType],
      badge: DOC_LABELS[docType],
      onClick: () => setModal({ label: DOC_FULL_LABELS[docType], targets: docTargets, color: DOC_COLORS[docType] }),
    });
  }
  if (btrData && btrMeasures > 0) {
    sources.push({
      key: "data:btr",
      name: "BTR Implementation Data",
      detail: `${btrMeasures} measure${btrMeasures === 1 ? "" : "s"}`,
      color: "#7c3aed",
      badge: "BTR",
    });
  }
  if (nr7Data && nr7Count > 0) {
    sources.push({
      key: "data:nr7",
      name: "NR7 Progress Reporting",
      detail: `${nr7Count} target${nr7Count === 1 ? "" : "s"} tracked`,
      color: "#16a34a",
      badge: "NR7",
    });
  }

  return (
    <>
      <section className="mb-8">
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-[var(--undp-black)]">Data Sources</h2>
          <p className="text-sm text-[var(--undp-gray)] mt-0.5">
            {sources.length} source{sources.length !== 1 ? "s" : ""} · {targets.length} policy targets
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {sources.map((s) => {
            const Tag = s.onClick ? "button" : "div";
            return (
              <Tag
                key={s.key}
                type={s.onClick ? "button" : undefined}
                onClick={s.onClick}
                className={[
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-left transition-colors",
                  s.onClick
                    ? "border-gray-200 bg-white hover:border-[var(--undp-blue)]/30 hover:bg-gray-50 cursor-pointer group"
                    : "border-gray-100 bg-white",
                ].join(" ")}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-xs font-medium text-[var(--undp-black)] group-hover:text-[var(--undp-blue)] transition-colors">
                  {s.badge}
                </span>
                <span className="text-[11px] text-[var(--undp-gray)]">{s.detail}</span>
              </Tag>
            );
          })}
        </div>
      </section>

      {modal && (
        <TargetListModal
          label={modal.label}
          targets={modal.targets}
          color={modal.color}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
