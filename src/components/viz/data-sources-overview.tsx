"use client";

import { useState } from "react";
import { DOC_COLORS, DOC_LABELS, DOC_MEDIUM_LABELS, DOC_FULL_LABELS } from "@/lib/utils";
import { InfoBox } from "@/components/ui/info-box";
import { Modal } from "@/components/ui/modal";
import { TargetTextWithHighlights, ActivitiesActions } from "./target-text";
import type { Target, PolicyDocumentType, BtrData, Nr7Data } from "@/types";

// ─── Target list modal ────────────────────────────────────────────────────────

function TargetListModal({ label, targets, onClose }: {
  label: string; targets: Target[]; onClose: () => void;
}) {
  return (
    <Modal open={true} onClose={onClose} title={label} maxWidth="max-w-xl">
      <ul className="divide-y divide-gray-50 px-5 py-2">
        {targets.map((t) => (
          <li key={t.id} className="py-3.5">
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold text-white leading-none"
                style={{ backgroundColor: DOC_COLORS[t.sourceDocument] }}
                title={DOC_FULL_LABELS[t.sourceDocument]}
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
            <ActivitiesActions target={t} />
          </li>
        ))}
      </ul>
    </Modal>
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
      badge: DOC_MEDIUM_LABELS[docType],
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
          <h2 className="text-lg font-semibold text-[var(--undp-black)]">
            Data Sources
            <InfoBox>
              These are the policy documents analyzed. Click any document source to see the individual targets extracted from it.
              <br /><br />
              <strong>NDC</strong> = Nationally Determined Contribution<br />
              <strong>NBT</strong> = National Biodiversity Targets (from the NBSAP)<br />
              <strong>NAP</strong> = National Adaptation Plan
            </InfoBox>
          </h2>
          <p className="text-sm text-[var(--undp-gray)] mt-0.5">
            {sources.length} source{sources.length !== 1 ? "s" : ""} · {targets.length} policy targets
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {sources.map((s) => {
            const Tag = s.onClick ? "button" : "div";
            return (
              <Tag
                key={s.key}
                type={s.onClick ? "button" : undefined}
                onClick={s.onClick}
                className={[
                  "flex items-center gap-2.5 rounded-lg border text-left transition-all",
                  s.onClick
                    ? "px-3.5 py-2.5 border-gray-200 bg-white hover:border-[var(--undp-blue)]/40 hover:bg-[var(--undp-blue)]/5 hover:shadow-sm cursor-pointer group"
                    : "px-3 py-2 border-gray-100 bg-gray-50/60 opacity-70",
                ].join(" ")}
              >
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
                <span className={[
                  "text-xs font-semibold transition-colors",
                  s.onClick ? "text-[var(--undp-black)] group-hover:text-[var(--undp-blue)]" : "text-[var(--undp-gray)]",
                ].join(" ")}>
                  {s.badge}
                </span>
                <span className="text-[11px] text-[var(--undp-gray)]">{s.detail}</span>
                {s.onClick && (
                  <span className="text-[11px] text-[var(--undp-blue)] opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 whitespace-nowrap">
                    View targets &rarr;
                  </span>
                )}
              </Tag>
            );
          })}
        </div>
      </section>

      {modal && (
        <TargetListModal
          label={modal.label}
          targets={modal.targets}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
