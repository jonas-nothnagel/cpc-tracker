"use client";

import { useState } from "react";
import { DOC_COLORS, DOC_LABELS, DOC_MEDIUM_LABELS, DOC_FULL_LABELS } from "@/lib/utils";
import { InfoBox } from "@/components/ui/info-box";
import { Modal } from "@/components/ui/modal";
import { TargetTextWithHighlights, ActivitiesActions } from "./target-text";
import type { Target, PolicyDocumentType, BtrData, Nr7Data } from "@/types";

// ─── Acronym descriptions for InfoBox ─────────────────────────────────────────

const ACRONYM_DESCRIPTIONS: Record<string, string> = {
  NDC: "Nationally Determined Contribution",
  NBSAP: "National Biodiversity Strategy and Action Plan",
  NAP: "National Adaptation Plan",
  LDN: "Land Degradation Neutrality",
  BTR: "Biennial Transparency Report",
  NR7: "7th National Report to the Convention on Biological Diversity",
};
const ACRONYM_ORDER = ["NDC", "NBSAP", "NAP", "LDN", "BTR", "NR7"];

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

  const btrMeasures = btrData?.mitigationMeasures.filter(m => m.status?.trim()).length ?? 0;
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
    // Skip BTR pseudo-targets — BTR is shown via the "BTR (Actions)" entry below
    if (docType === "BTR") continue;
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
      name: "BTR Reported Actions",
      detail: `${btrMeasures} reported action${btrMeasures === 1 ? "" : "s"}`,
      color: "#7c3aed",
      badge: "BTR (Actions)",
    });
  }
  if (nr7Data && nr7Count > 0) {
    sources.push({
      key: "data:nr7",
      name: "NBSAP Progress (7th National Report)",
      detail: `tracking ${nr7Count} NBSAP target${nr7Count === 1 ? "" : "s"}`,
      color: "#16a34a",
      badge: "NR7",
    });
  }

  // Dynamic abbreviation list for InfoBox
  const presentAbbreviations = new Set<string>();
  for (const dt of docTypes) {
    if (dt in ACRONYM_DESCRIPTIONS) presentAbbreviations.add(dt);
  }
  if (btrData && btrMeasures > 0) presentAbbreviations.add("BTR");
  if (nr7Data && nr7Count > 0) presentAbbreviations.add("NR7");
  const abbrList = ACRONYM_ORDER.filter(a => presentAbbreviations.has(a));

  // Summary counts (exclude BTR pseudo-targets — those are shown via BTR Actions entry)
  const policyTargetCount = targets.filter(t => t.sourceDocument !== "BTR").length;
  const summaryParts: string[] = [];
  if (policyTargetCount > 0) summaryParts.push(`${policyTargetCount} policy target${policyTargetCount !== 1 ? "s" : ""}`);
  if (btrMeasures > 0) summaryParts.push(`${btrMeasures} BTR action${btrMeasures !== 1 ? "s" : ""}`);
  const itemsSummary = summaryParts.join(" · ");

  return (
    <>
      <section className="mb-6">
        <div className="flex items-baseline gap-2 mb-2">
          <h2 className="text-sm font-semibold text-[var(--undp-black)]">
            Data Sources
            <InfoBox>
              These are the policy documents and data sources analyzed. Click any source to see its contents.
              {abbrList.length > 0 && (
                <>
                  <br /><br />
                  {abbrList.map((abbr, i) => (
                    <span key={abbr}>
                      <strong>{abbr}</strong> = {ACRONYM_DESCRIPTIONS[abbr]}
                      {i < abbrList.length - 1 ? <br /> : null}
                    </span>
                  ))}
                </>
              )}
            </InfoBox>
          </h2>
          <span className="text-xs text-[var(--undp-gray)]">
            {sources.length} source{sources.length !== 1 ? "s" : ""} · {itemsSummary}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {sources.map((s) => {
            const Tag = s.onClick ? "button" : "span";
            return (
              <Tag
                key={s.key}
                type={s.onClick ? "button" : undefined}
                onClick={s.onClick}
                className={[
                  "inline-flex items-center gap-1.5 text-left",
                  s.onClick
                    ? "group cursor-pointer transition-colors"
                    : "opacity-70",
                ].join(" ")}
              >
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
                <span className={[
                  "text-xs font-medium",
                  s.onClick
                    ? "text-[var(--undp-black)] underline decoration-dotted decoration-gray-300 underline-offset-2 group-hover:decoration-[var(--undp-blue)] group-hover:text-[var(--undp-blue)]"
                    : "text-[var(--undp-gray)]",
                ].join(" ")}>
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
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
