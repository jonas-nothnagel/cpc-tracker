"use client";

import { useState } from "react";
import Image from "next/image";
import { DOC_COLORS, DOC_LABELS } from "@/lib/utils";
import { TargetTextWithHighlights } from "./target-text";
import type { Target, PolicyDocumentType, BtrData } from "@/types";

const DOC_FULL_LABELS: Record<PolicyDocumentType, string> = {
  NDC: "Nationally Determined Contribution",
  NBSAP: "National Biodiversity Strategy & Action Plan",
  NAP: "National Adaptation Plan",
  LDN: "Land Degradation Neutrality",
  SECTORAL: "Sectoral Policy",
  OTHER: "Other Policy Document",
};

const DOC_LOGO: Partial<Record<PolicyDocumentType, string>> = {
  NDC: "/unfccc-logo.svg",
  NAP: "/unfccc-logo.svg",
  NBSAP: "/cbd-logo.svg",
  LDN: "/unccd-logo.svg",
};

function TargetListModal({ label, targets, color, onClose }: {
  label: string; targets: Target[]; color: string; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-medium text-[var(--undp-black)] flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
            {label} ({targets.length})
          </h3>
          <button type="button" onClick={onClose} className="text-[var(--undp-gray)] hover:text-[var(--undp-black)] text-xl leading-none">×</button>
        </div>
        <div className="overflow-auto flex-1 px-6 py-4">
          <ul className="space-y-3">
            {targets.map((t) => (
              <li key={t.id} className="flex gap-3 text-sm py-2 border-b border-gray-50 last:border-0">
                <span className="shrink-0 inline-block px-2 py-0.5 rounded text-xs font-medium text-white" style={{ backgroundColor: DOC_COLORS[t.sourceDocument] }}>
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
  );
}

function Arrow() {
  return (
    <div className="flex items-center self-center px-1 shrink-0 text-gray-300">
      <svg width="24" height="12" viewBox="0 0 24 12" fill="none">
        <path d="M0 6h18M15 2l6 4-6 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

interface DataSourcesOverviewProps {
  targets: Target[];
  alignmentOpportunities: number;
  btrData: BtrData | null;
}

export function DataSourcesOverview({ targets, alignmentOpportunities, btrData }: DataSourcesOverviewProps) {
  const [modal, setModal] = useState<{ label: string; targets: Target[]; color: string } | null>(null);

  const targetsByDoc = new Map<PolicyDocumentType, Target[]>();
  for (const t of targets) {
    const list = targetsByDoc.get(t.sourceDocument) ?? [];
    list.push(t);
    targetsByDoc.set(t.sourceDocument, list);
  }
  const docTypes = Array.from(targetsByDoc.keys());

  const btrMeasures = btrData?.mitigationMeasures.length ?? 0;
  const btrImplemented = btrData?.mitigationMeasures.filter(
    (m) => m.status.toLowerCase().includes("implemented")
  ).length ?? 0;

  return (
    <>
      <div className="mb-10 bg-white border border-gray-100 rounded-lg px-5 py-4">
        <div className="flex items-stretch gap-0">

          {/* ── Data sources ─────────────────────────────────────── */}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-2.5">
              Data sources
            </p>
            <div className="flex flex-col gap-1.5">
              {docTypes.map((docType) => {
                const docTargets = targetsByDoc.get(docType) ?? [];
                const color = DOC_COLORS[docType];
                const logo = DOC_LOGO[docType];
                return (
                  <button
                    key={docType}
                    type="button"
                    onClick={() => setModal({ label: DOC_FULL_LABELS[docType], targets: docTargets, color })}
                    className="flex items-center gap-2.5 px-3 py-1.5 rounded border text-left transition-all hover:bg-gray-50/80 group"
                    style={{ borderColor: `${color}25` }}
                  >
                    {logo && (
                      <Image src={logo} alt="" width={48} height={14} className="h-3.5 w-auto shrink-0" unoptimized />
                    )}
                    <span className="text-[11px] text-[var(--undp-black)] truncate flex-1">
                      {DOC_FULL_LABELS[docType]}
                    </span>
                    <span className="text-[11px] font-semibold tabular-nums shrink-0" style={{ color }}>
                      {docTargets.length}
                    </span>
                  </button>
                );
              })}

              {btrData && (
                <div className="flex items-center gap-2.5 px-3 py-1.5 rounded border border-[#009EDB]/20">
                  <Image src="/unfccc-logo.svg" alt="" width={48} height={14} className="h-3.5 w-auto shrink-0" unoptimized />
                  <span className="text-[11px] text-[var(--undp-black)] truncate flex-1">
                    Biennial Transparency Report
                  </span>
                  <span className="text-[11px] font-semibold tabular-nums text-[#009EDB] shrink-0">
                    {btrMeasures}
                  </span>
                </div>
              )}

              {/* Planned — more visible placeholder */}
              <div className="flex items-center gap-2 px-3 py-2 rounded border border-dashed border-gray-300 bg-gray-50/60">
                <span className="text-[10px] font-medium text-gray-500">
                  + NR7, FTC Finance, Sectoral policies, …
                </span>
              </div>
            </div>
          </div>

          <Arrow />

          {/* ── Pipeline ─────────────────────────────────────────── */}
          <div className="min-w-[140px] shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-2.5">
              Analysis
            </p>
            <div className="flex flex-col gap-1 text-[11px]">
              {[
                { label: "Target extraction",  color: "#0468b1" },
                { label: "NBS classification", color: "#00853F" },
                { label: "IPCC sector tagging", color: "#0d9488" },
                { label: "Alignment scoring",  color: "#7c3aed" },
                { label: "BTR integration",    color: "#009EDB", dim: !btrData },
                { label: "…",                  color: "#d1d5db", placeholder: true },
              ].map((s) => (
                <div
                  key={"placeholder" in s ? "pipeline-placeholder" : s.label}
                  className="flex items-center gap-1.5 py-0.5"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: "placeholder" in s ? "#d1d5db" : s.dim ? "#d1d5db" : s.color }}
                  />
                  <span className={"placeholder" in s ? "text-gray-400 italic" : s.dim ? "text-gray-400" : "text-[var(--undp-gray)]"}>
                    {"placeholder" in s ? "More steps planned" : s.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <Arrow />

          {/* ── Key numbers ───────────────────────────────────────── */}
          <div className="min-w-[120px] shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-2.5">
              Results
            </p>
            <div className="flex flex-col gap-2">
              {[
                {
                  value: targets.length,
                  label: "policy targets",
                  color: "#0468b1",
                  onClick: () => setModal({ label: "All policy targets", targets, color: "#0468b1" }),
                },
                { value: alignmentOpportunities, label: "alignment opportunities", color: "#7c3aed" },
                ...(btrData ? [
                  { value: btrMeasures, label: "BTR measures", color: "#009EDB" },
                  { value: btrImplemented, label: "fully implemented", color: "#4c9f38" },
                ] : []),
              ].map((s) => (
                <div
                  key={s.label}
                  role={"onClick" in s && s.onClick ? "button" : undefined}
                  tabIndex={"onClick" in s && s.onClick ? 0 : undefined}
                  onClick={"onClick" in s ? (s as { onClick: () => void }).onClick : undefined}
                  className={`${"onClick" in s && s.onClick ? "cursor-pointer hover:bg-gray-50 transition-colors" : ""}`}
                >
                  <span className="text-lg font-semibold tabular-nums leading-none" style={{ color: s.color }}>
                    {s.value}
                  </span>
                  <span className="text-[10px] text-[var(--undp-gray)] ml-1.5">{s.label}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

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
