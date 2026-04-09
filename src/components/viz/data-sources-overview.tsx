"use client";

import { useState } from "react";
import { getDocColor, getDocFullLabel, getDocLabel, getDocMediumLabel, getDocTypeOrder } from "@/lib/utils";
import { InfoBox } from "@/components/ui/info-box";
import { Modal } from "@/components/ui/modal";
import {
  TargetTextWithHighlights,
  ActivitiesActions,
  ActionTypeBadge,
  BTR_ADAPTATION_COLOR,
  BTR_MITIGATION_COLOR,
  OriginalLanguageChip,
} from "./target-text";
import type {
  Target,
  PolicyDocumentType,
  BtrData,
  Nr7Data,
  CountryConfig,
  SourceRef,
} from "@/types";

/**
 * Format a structured SourceRef into a single-line citation string like
 * "Mongolia BTR1 (December 2025), CTF-NDC Table 5 / PDF Table II.6, pp. 93-94".
 * Returns undefined when the ref is missing or empty, so callers can fall back
 * to no tooltip.
 */
function formatSourceRef(ref?: SourceRef): string | undefined {
  if (!ref) return undefined;
  const parts: string[] = [];
  if (ref.document) parts.push(ref.document);
  const detail: string[] = [];
  if (ref.section) detail.push(ref.section);
  if (ref.table) detail.push(ref.table);
  if (detail.length) parts.push(detail.join(" / "));
  if (ref.pages) parts.push(`pp. ${ref.pages}`);
  if (ref.annex) parts.push(ref.annex);
  return parts.length ? parts.join(", ") : undefined;
}

// ─── Target list modal ────────────────────────────────────────────────────────

/**
 * Modal that lists a set of targets (policy targets or BTR pseudo-targets) with
 * optional primary-document provenance shown above the list. Shared by both
 * policy-document and BTR-action data source chips so the inspection UX is
 * consistent across the two sources.
 */
function TargetListModal({ label, targets, sourceRef, countryConfig, onClose }: {
  label: string;
  targets: Target[];
  sourceRef?: string;
  countryConfig?: CountryConfig | null;
  onClose: () => void;
}) {
  return (
    <Modal open={true} onClose={onClose} title={label} maxWidth="max-w-xl">
      {sourceRef && (
        <p className="px-5 pt-3 text-[11px] text-[var(--undp-gray)] italic border-b border-gray-50 pb-2">
          Source: {sourceRef}
        </p>
      )}
      <ul className="divide-y divide-gray-50 px-5 py-2">
        {targets.map((t) => (
          <li key={t.id} className="py-3.5">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span
                className="inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold text-white leading-none"
                style={{ backgroundColor: getDocColor(countryConfig, t.sourceDocument) }}
                title={getDocFullLabel(countryConfig, t.sourceDocument)}
              >
                {getDocLabel(countryConfig, t.sourceDocument)}
              </span>
              <ActionTypeBadge actionType={t.actionType} />
              <OriginalLanguageChip target={t} />
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
  /**
   * Country-specific presentation config loaded from
   * `{country}-country-config.json`. Supplies provenance strings for the
   * source chips. When null the chips show without a provenance tooltip.
   */
  countryConfig?: CountryConfig | null;
}

export function DataSourcesOverview({ targets, btrData, nr7Data, countryConfig }: DataSourcesOverviewProps) {
  const [modal, setModal] = useState<{
    label: string;
    targets: Target[];
    color: string;
    sourceRef?: string;
  } | null>(null);

  const targetsByDoc = new Map<PolicyDocumentType, Target[]>();
  for (const t of targets) {
    const list = targetsByDoc.get(t.sourceDocument) ?? [];
    list.push(t);
    targetsByDoc.set(t.sourceDocument, list);
  }
  // Sort order comes from the country config's documentTypes array so each
  // country can order its chips naturally (NP first for Panama, NDC first for
  // Mongolia, etc.). Unknown ids and reserved tokens sort to the end — see
  // `getDocTypeOrder` in @/lib/utils.
  const docTypes = Array.from(targetsByDoc.keys()).sort(
    (a, b) => getDocTypeOrder(countryConfig, a) - getDocTypeOrder(countryConfig, b),
  );

  // Split BTR reported actions into mitigation vs adaptation so the two types
  // are visible as distinct sources (stakeholder ask, 7 April 2026 Mongolia call).
  const btrRows = btrData?.mitigationMeasures.filter((m) => m.status?.trim()) ?? [];
  const btrMitigationCount = btrRows.filter((m) => m.actionType !== "adaptation").length;
  const btrAdaptationCount = btrRows.filter((m) => m.actionType === "adaptation").length;
  const btrMeasures = btrMitigationCount + btrAdaptationCount;
  const nr7Count = nr7Data?.progressItems.length ?? 0;

  type SourceEntry = {
    key: string;
    name: string;
    detail: string;
    color: string;
    badge: string;
    /** Human-readable provenance string, e.g. "BTR1 (Dec 2025), Table III.9 pp.123-126". */
    provenance?: string;
    onClick?: () => void;
  };

  // Provenance strings come from the country config file (e.g.
  // `mongolia-country-config.json`), not hardcoded here. A second country
  // drops its own config and the chip tooltips update automatically. When the
  // config is missing, chips show without a provenance tooltip rather than
  // showing fabricated citations.
  const docProvenance = countryConfig?.docProvenance ?? {};

  const sources: SourceEntry[] = [];
  for (const docType of docTypes) {
    // Skip BTR pseudo-targets — BTR is shown via the "BTR (Actions)" entry below
    if (docType === "BTR") continue;
    const docTargets = targetsByDoc.get(docType) ?? [];
    const fullLabel = getDocFullLabel(countryConfig, docType);
    const docColor = getDocColor(countryConfig, docType);
    sources.push({
      key: `doc:${docType}`,
      name: fullLabel,
      detail: `${docTargets.length} target${docTargets.length === 1 ? "" : "s"}`,
      color: docColor,
      badge: getDocMediumLabel(countryConfig, docType),
      provenance: docProvenance[docType],
      onClick: () => setModal({ label: fullLabel, targets: docTargets, color: docColor }),
    });
  }
  // BTR pseudo-targets are already merged into the `targets` prop by the
  // dashboard API route — filter them by actionType for each BTR source chip.
  const btrMitigationTargets = targets.filter(
    (t) => t.sourceDocument === "BTR" && t.actionType !== "adaptation",
  );
  const btrAdaptationTargets = targets.filter(
    (t) => t.sourceDocument === "BTR" && t.actionType === "adaptation",
  );

  if (btrData && btrMitigationCount > 0) {
    const mitProvenance = formatSourceRef(countryConfig?.btrMitigationSourceRef);
    sources.push({
      key: "data:btr-mit",
      name: "BTR Reported Mitigation Actions",
      detail: `${btrMitigationCount} mitigation action${btrMitigationCount === 1 ? "" : "s"}`,
      color: BTR_MITIGATION_COLOR,
      badge: "BTR Mitigation",
      provenance: mitProvenance,
      onClick: () =>
        setModal({
          label: "BTR Reported Mitigation Actions",
          targets: btrMitigationTargets,
          color: BTR_MITIGATION_COLOR,
          sourceRef: mitProvenance,
        }),
    });
  }
  if (btrData && btrAdaptationCount > 0) {
    // Adaptation source ref comes from the country's adaptation data file
    // (already passed through by the dashboard API), so this chip updates
    // automatically when a second country adds their file.
    const adpProvenance = formatSourceRef(btrData.adaptationSourceRef);
    sources.push({
      key: "data:btr-adp",
      name: "BTR Reported Adaptation Actions",
      detail: `${btrAdaptationCount} adaptation action${btrAdaptationCount === 1 ? "" : "s"}`,
      color: BTR_ADAPTATION_COLOR,
      badge: "BTR Adaptation",
      provenance: adpProvenance,
      onClick: () =>
        setModal({
          label: "BTR Reported Adaptation Actions",
          targets: btrAdaptationTargets,
          color: BTR_ADAPTATION_COLOR,
          sourceRef: adpProvenance,
        }),
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

  // Dynamic abbreviation list for the InfoBox. Each entry pairs a document
  // type id with its full label, pulled from the country's documentTypes via
  // `getDocFullLabel`. This drops the old hardcoded Mongolia-only map, so
  // Panama's NP/ENR/IRMF/SPGCF/CNR abbreviations are explained on hover the
  // same way Mongolia's NDC/NBSAP/... always were. NR7 is appended manually
  // because it's a data source, not a document type in the registry.
  const abbrList: { abbr: string; description: string }[] = [];
  const seenAbbrs = new Set<string>();
  for (const dt of docTypes) {
    if (seenAbbrs.has(dt)) continue;
    const full = getDocFullLabel(countryConfig, dt);
    if (full !== dt) {
      // Helper resolved a name richer than the raw id — worth expanding.
      abbrList.push({ abbr: dt, description: full });
      seenAbbrs.add(dt);
    }
  }
  if (btrData && btrMeasures > 0 && !seenAbbrs.has("BTR")) {
    abbrList.push({
      abbr: "BTR",
      description: getDocFullLabel(countryConfig, "BTR"),
    });
  }
  if (nr7Data && nr7Count > 0) {
    abbrList.push({
      abbr: "NR7",
      description: "7th National Report to the Convention on Biological Diversity",
    });
  }

  // Summary counts (exclude BTR pseudo-targets — those are shown via BTR Actions entries)
  const policyTargetCount = targets.filter(t => t.sourceDocument !== "BTR").length;
  const summaryParts: string[] = [];
  if (policyTargetCount > 0) summaryParts.push(`${policyTargetCount} policy target${policyTargetCount !== 1 ? "s" : ""}`);
  if (btrMeasures > 0) summaryParts.push(`${btrMeasures} BTR action${btrMeasures !== 1 ? "s" : ""}`);
  const itemsSummary = summaryParts.join(" · ");

  // Format a provenance tooltip that shows on hover over a source chip.
  // Users see the primary-document citation; makes each source auditable.
  const provenanceTitle = (s: SourceEntry) =>
    s.provenance ? `${s.name} · Source: ${s.provenance}` : s.name;

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
                  {abbrList.map((entry, i) => (
                    <span key={entry.abbr}>
                      <strong>{entry.abbr}</strong> = {entry.description}
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
                title={provenanceTitle(s)}
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
                {s.provenance && (
                  <span
                    className="text-[9px] text-[var(--undp-gray)]/60 leading-none"
                    aria-label="Provenance available on hover"
                  >
                    ⓘ
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
          sourceRef={modal.sourceRef}
          countryConfig={countryConfig}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
