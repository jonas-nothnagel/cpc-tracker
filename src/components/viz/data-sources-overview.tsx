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
  BTR: "Biennial Transparency Report",
  OTHER: "Other Policy Document",
};

const DOC_LOGO: Partial<Record<PolicyDocumentType, string>> = {
  NDC:      "/unfccc.png",
  NAP:      "/unfccc.png",
  NBSAP:    "/cbd_logo.png",
  LDN:      "/unccd.png",
};

// ─── Target list modal ────────────────────────────────────────────────────────

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

// ─── Arrow ───────────────────────────────────────────────────────────────────

function Arrow() {
  return (
    <div className="flex items-center shrink-0 px-1.5 text-gray-300">
      <svg width="20" height="10" viewBox="0 0 20 10" fill="none">
        <path d="M0 5h14M11 1l6 4-6 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ─── Individual source box ────────────────────────────────────────────────────

function SourceBox({ logo, name, abbr, count, color, onClick, planned = false }: {
  logo?: string;
  name: string;
  abbr?: string;
  count?: number;
  color: string;
  onClick?: () => void;
  planned?: boolean;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={[
        "flex items-center gap-3 px-3 py-2.5 rounded border text-left w-full",
        planned
          ? "border-dashed border-gray-300 bg-white/50 opacity-50"
          : "border-gray-200 bg-white",
        onClick ? "hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer" : "",
      ].join(" ")}
    >
      {/* Logo */}
      <div className="w-16 shrink-0 flex items-center justify-center">
        {logo && !planned ? (
          <Image src={logo} alt="" width={64} height={32} className="max-h-10 w-auto object-contain" unoptimized />
        ) : (
          <span className="text-[10px] font-bold text-gray-400">{abbr}</span>
        )}
      </div>

      {/* Name + count */}
      <div className="min-w-0 flex-1">
        <p className={`text-[11px] font-medium leading-tight truncate ${planned ? "text-gray-400" : "text-[var(--undp-black)]"}`}>
          {name}
        </p>
        {abbr && !planned && (
          <p className="text-[9px] text-[var(--undp-gray)] mt-0.5">{abbr}</p>
        )}
      </div>

      {/* Count badge */}
      {count !== undefined && !planned && (
        <span className="text-[11px] font-semibold tabular-nums shrink-0 text-[var(--undp-gray)]">
          {count}
        </span>
      )}
    </Tag>
  );
}

// ─── Bracket connector: many boxes → one arrow ───────────────────────────────
// A thin vertical line with a horizontal tick at each box's midpoint, joining
// into a single horizontal arrow pointing right. Rendered purely with CSS.

function BracketConnector({ rowCount }: { rowCount: number }) {
  // Each SourceBox: ~52px height + 6px gap
  const rowH = 52;
  const gap = 6;
  const totalH = rowCount * rowH + (rowCount - 1) * gap;
  const midY = totalH / 2;

  return (
    <svg width="28" height={totalH} viewBox={`0 0 28 ${totalH}`} fill="none" className="text-gray-300" style={{ display: "block" }}>
      {/* Vertical bar on left */}
      <line x1="4" y1="0" x2="4" y2={totalH} stroke="currentColor" strokeWidth="1.5" />
      {/* Tick at each row midpoint */}
      {Array.from({ length: rowCount }).map((_, i) => {
        const y = i * (rowH + gap) + rowH / 2;
        return <line key={i} x1="0" y1={y} x2="4" y2={y} stroke="currentColor" strokeWidth="1.5" />;
      })}
      {/* Stem from bar to arrowhead */}
      <line x1="4" y1={midY} x2="22" y2={midY} stroke="currentColor" strokeWidth="1.5" />
      {/* Arrowhead */}
      <path d={`M16 ${midY - 4} L22 ${midY} L16 ${midY + 4}`} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

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

  const dataSourceCount = docTypes.length + (btrData ? 1 : 0);
  const btrMeasures = btrData?.mitigationMeasures.length ?? 0;

  // All source boxes (active + BTR + planned placeholder)
  const activeSourceCount = docTypes.length + (btrData ? 1 : 0) + 1; // +1 for planned

  const colHeaderClass = "text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)]";

  return (
    <>
      <div className="mb-10 bg-white border border-gray-100 rounded-lg px-5 pt-4 pb-5">

        {/* ── Header row ───────────────────────────────────────────── */}
        <div className="flex items-end mb-2.5 gap-0">
          <div className="min-w-[220px] max-w-[260px]">
            <p className={colHeaderClass}>Data sources</p>
          </div>
          {/* bracket + spacer width */}
          <div style={{ width: 28 }} />
          <div className="min-w-[110px] mx-2">
            <p className={colHeaderClass}>Analysis</p>
          </div>
          {/* arrow spacer */}
          <div style={{ width: 32 }} />
          <div>
            <p className={colHeaderClass}>Results</p>
          </div>
        </div>

        {/* ── Content row ──────────────────────────────────────────── */}
        <div className="flex items-center gap-0">

          {/* Source boxes */}
          <div className="flex flex-col gap-1.5 min-w-[220px] max-w-[260px] self-stretch justify-center">
            {docTypes.map((docType) => {
              const docTargets = targetsByDoc.get(docType) ?? [];
              return (
                <SourceBox
                  key={docType}
                  logo={DOC_LOGO[docType]}
                  name={DOC_FULL_LABELS[docType]}
                  abbr={DOC_LABELS[docType]}
                  count={docTargets.length}
                  color={DOC_COLORS[docType]}
                  onClick={() => setModal({ label: DOC_FULL_LABELS[docType], targets: docTargets, color: DOC_COLORS[docType] })}
                />
              );
            })}
            {btrData && (
              <SourceBox
                logo="/unfccc.png"
                name="Biennial Transparency Report"
                abbr="BTR / CTF"
                count={btrMeasures}
                color="#009EDB"
              />
            )}
            <SourceBox
              name="NR7, FTC Finance, Sectoral policies, …"
              abbr="+"
              color="#9ca3af"
              planned
            />
          </div>

          {/* Bracket connector — self-stretch so SVG spans the sources height */}
          <div className="self-stretch mx-0 shrink-0 flex items-center" style={{ width: 28 }}>
            <BracketConnector rowCount={activeSourceCount} />
          </div>

          {/* Pipeline */}
          <div className="shrink-0 min-w-[110px] mx-2 px-3 py-2.5 rounded border border-gray-200 bg-[var(--undp-light)] self-center">
            <ul className="flex flex-col gap-1 text-[10px] text-[var(--undp-gray)]">
              {["Target extraction", "NBS classification", "IPCC sectors", "Alignment scoring", "BTR integration", "…"].map((label, i) => (
                <li key={i} className={`flex items-center gap-1.5 ${label === "…" ? "text-gray-400 italic" : ""}`}>
                  {label !== "…" && <span className="w-1 h-1 rounded-full bg-gray-400 shrink-0" />}
                  {label}
                </li>
              ))}
            </ul>
          </div>

          {/* Arrow */}
          <div className="flex items-center shrink-0 px-2 text-gray-300">
            <svg width="24" height="12" viewBox="0 0 24 12" fill="none">
              <path d="M0 6h18M15 2l7 4-7 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* Results */}
          <div className="shrink-0 flex flex-col gap-3">
            {[
              { value: dataSourceCount, label: "data sources" },
              { value: targets.length, label: "policy targets", onClick: () => setModal({ label: "All policy targets", targets, color: "#0468b1" }) },
              { value: alignmentOpportunities, label: "alignment opportunities" },
            ].map((s) => (
              <div
                key={s.label}
                role={"onClick" in s ? "button" : undefined}
                tabIndex={"onClick" in s ? 0 : undefined}
                onClick={"onClick" in s ? (s as { onClick: () => void }).onClick : undefined}
                onKeyDown={"onClick" in s ? (e: React.KeyboardEvent) => { if (e.key === "Enter") (s as { onClick: () => void }).onClick(); } : undefined}
                className={"onClick" in s ? "cursor-pointer rounded px-1 -mx-1 hover:bg-gray-50 transition-colors" : ""}
              >
                <span className="text-xl font-semibold tabular-nums leading-none text-[var(--undp-blue)]">{s.value}</span>
                <span className="text-[10px] text-[var(--undp-gray)] ml-1.5 leading-none">{s.label}</span>
              </div>
            ))}
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
