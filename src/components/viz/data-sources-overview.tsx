"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { DOC_COLORS, DOC_LABELS } from "@/lib/utils";
import { TargetTextWithHighlights } from "./target-text";
import type { Target, PolicyDocumentType, BtrData } from "@/types";

// ─── Metadata ─────────────────────────────────────────────────────────────────

const DOC_FULL_LABELS: Record<PolicyDocumentType, string> = {
  NDC: "Nationally Determined Contribution",
  NBSAP: "National Biodiversity Strategy & Action Plan",
  NAP: "National Adaptation Plan",
  LDN: "Land Degradation Neutrality",
  SECTORAL: "Sectoral Policy",
  OTHER: "Other Policy Document",
};

const DOC_CONVENTION: Partial<Record<PolicyDocumentType, { logo: string; color: string }>> = {
  NDC:   { logo: "/unfccc-logo.svg", color: "#009EDB" },
  NAP:   { logo: "/unfccc-logo.svg", color: "#009EDB" },
  NBSAP: { logo: "/cbd-logo.svg",    color: "#00853F" },
  LDN:   { logo: "/unccd-logo.svg",  color: "#B8541A" },
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

// ─── Curved SVG connector ─────────────────────────────────────────────────────

function CurvedConnector({ fromRef, toRef, containerRef }: {
  fromRef: React.RefObject<HTMLElement | null>;
  toRef: React.RefObject<HTMLElement | null>;
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  const [path, setPath] = useState("");

  useEffect(() => {
    function compute() {
      const c = containerRef.current;
      const f = fromRef.current;
      const t = toRef.current;
      if (!c || !f || !t) return;
      const cb = c.getBoundingClientRect();
      const fb = f.getBoundingClientRect();
      const tb = t.getBoundingClientRect();
      const x1 = fb.right - cb.left;
      const y1 = fb.top + fb.height / 2 - cb.top;
      const x2 = tb.left - cb.left;
      const y2 = tb.top + tb.height / 2 - cb.top;
      const cx = (x1 + x2) / 2;
      setPath(`M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`);
    }
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [fromRef, toRef, containerRef]);

  if (!path) return null;
  return (
    <path d={path} fill="none" stroke="#c8d4e0" strokeWidth="1.5"
      strokeDasharray="5 3" markerEnd="url(#cpc-arrow)" />
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

  const btrMeasures  = btrData?.mitigationMeasures.length ?? 0;
  const btrImplemented = btrData?.mitigationMeasures.filter(
    (m) => m.status.toLowerCase().includes("implemented")
  ).length ?? 0;

  // Refs for curved connectors
  const containerRef = useRef<HTMLDivElement>(null);
  const sourcesRef   = useRef<HTMLDivElement>(null);
  const pipelineRef  = useRef<HTMLDivElement>(null);
  const statsRef     = useRef<HTMLDivElement>(null);

  return (
    <>
      <div
        className="mb-10 bg-[var(--undp-light)] border border-gray-100 rounded-lg p-4 relative overflow-hidden"
        ref={containerRef}
      >
        {/* Curved SVG connectors */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
          <defs>
            <marker id="cpc-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill="#c8d4e0" />
            </marker>
          </defs>
          <CurvedConnector fromRef={sourcesRef} toRef={pipelineRef} containerRef={containerRef} />
          <CurvedConnector fromRef={pipelineRef} toRef={statsRef}   containerRef={containerRef} />
        </svg>

        <div className="relative z-10 flex items-start gap-2 w-full">

          {/* ── 1. Data sources (prominent) ───────────────────────────── */}
          <div className="flex flex-col gap-2 flex-1 min-w-0" ref={sourcesRef}>
            <p className="text-[9px] font-semibold uppercase tracking-widest text-[var(--undp-gray)]">
              Data sources
            </p>

            {/* Active documents */}
            {docTypes.map((docType) => {
              const docTargets = targetsByDoc.get(docType) ?? [];
              const color      = DOC_COLORS[docType];
              const conv       = DOC_CONVENTION[docType];
              return (
                <button
                  key={docType}
                  type="button"
                  onClick={() => setModal({ label: DOC_FULL_LABELS[docType], targets: docTargets, color })}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-all hover:shadow-sm hover:bg-white group"
                  style={{ borderColor: `${color}40`, backgroundColor: `${color}0d` }}
                >
                  <div className="min-w-0 flex-1">
                    {conv?.logo && (
                      <Image src={conv.logo} alt="" width={52} height={14} className="h-3.5 w-auto mb-1" unoptimized />
                    )}
                    <p className="text-[11px] font-semibold leading-tight" style={{ color }}>{DOC_FULL_LABELS[docType]}</p>
                    <p className="text-[9px] text-[var(--undp-gray)] leading-tight mt-0.5">{DOC_LABELS[docType]}</p>
                  </div>
                  <span className="text-sm font-bold tabular-nums shrink-0" style={{ color }}>{docTargets.length}</span>
                </button>
              );
            })}

            {/* BTR source */}
            {btrData && (
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-[#009EDB]/30 bg-[#009EDB]/07">
                <div className="min-w-0 flex-1">
                  <Image src="/unfccc-logo.svg" alt="UNFCCC" width={52} height={14} className="h-3.5 w-auto mb-1" unoptimized />
                  <p className="text-[11px] font-semibold text-[#009EDB] leading-tight">Biennial Transparency Report</p>
                  <p className="text-[9px] text-[var(--undp-gray)] leading-tight mt-0.5">BTR / CTF</p>
                </div>
                <span className="text-sm font-bold tabular-nums text-[#009EDB] shrink-0">{btrMeasures}m</span>
              </div>
            )}

            {/* Planned sources */}
            <div className="mt-0.5 pt-2 border-t border-dashed border-gray-200">
              <p className="text-[8px] font-semibold uppercase tracking-widest text-gray-400 mb-1.5">Planned</p>
              <div className="flex flex-col gap-1">
                {[
                  { abbr: "NR7",  label: "CBD National Report",  color: "#00853F" },
                  { abbr: "FTC",  label: "UNFCCC Finance data",  color: "#009EDB" },
                  { abbr: "POL",  label: "Sectoral policies",    color: "#555" },
                  { abbr: "···",  label: "More to come",         color: "#aaa" },
                ].map((p) => (
                  <div key={p.abbr} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-dashed border-gray-200 bg-gray-50/60 opacity-55">
                    <span className="text-[10px] font-bold shrink-0 w-7" style={{ color: p.color }}>{p.abbr}</span>
                    <span className="text-[9px] text-gray-400 truncate">{p.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Spacer for connector line */}
          <div className="w-10 shrink-0" />

          {/* ── 2. Pipeline (compact, subtle) ─────────────────────────── */}
          <div className="flex flex-col gap-1.5 flex-1 min-w-0" ref={pipelineRef}>
            <p className="text-[9px] font-semibold uppercase tracking-widest text-[var(--undp-gray)]">
              AI pipeline
            </p>
            {[
              { label: "Extract targets",  color: "#0468b1" },
              { label: "Classify NBS",     color: "#00853F" },
              { label: "Tag IPCC sectors", color: "#0d9488" },
              { label: "Score alignment",  color: "#7c3aed" },
              { label: "Link BTR data",    color: "#009EDB", dim: !btrData },
            ].map((s) => (
              <div
                key={s.label}
                className={`flex items-center gap-2 px-2 py-1 rounded text-[10px] ${s.dim ? "opacity-35" : ""}`}
                style={{ backgroundColor: `${s.color}0c`, borderLeft: `2px solid ${s.dim ? "#ccc" : s.color}` }}
              >
                <span className="font-medium" style={{ color: s.dim ? "#aaa" : s.color }}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* Spacer for connector line */}
          <div className="w-10 shrink-0" />

          {/* ── 3. Key numbers ────────────────────────────────────────── */}
          <div className="flex flex-col gap-2 flex-1 min-w-0" ref={statsRef}>
            <p className="text-[9px] font-semibold uppercase tracking-widest text-[var(--undp-gray)]">
              Key findings
            </p>

            <StatTile value={targets.length} label="policy targets" color="#0468b1" />
            <StatTile value={alignmentOpportunities} label="alignment opportunities" color="#7c3aed" />
            {btrData && (
              <>
                <StatTile value={btrMeasures}    label="mitigation measures" color="#009EDB" />
                <StatTile value={btrImplemented} label="fully implemented"   color="#4c9f38" />
              </>
            )}
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

function StatTile({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div
      className="px-3 py-2 rounded-lg border text-center"
      style={{ borderColor: `${color}30`, backgroundColor: `${color}08` }}
    >
      <p className="text-2xl font-bold tabular-nums leading-none" style={{ color }}>{value}</p>
      <p className="text-[9px] text-[var(--undp-gray)] mt-0.5 leading-tight">{label}</p>
    </div>
  );
}
