"use client";

import { useState } from "react";
import { getDocColor, getDocFullLabel, getDocLabel, getDocTypeOrder } from "@/lib/utils";
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
 * Implementation status snapshot rendered inside the BTR mitigation /
 * adaptation modals. Policy-document modals leave this undefined.
 */
type ImplementationStat = {
  implemented: number;
  total: number;
};

/**
 * Modal that lists a set of targets (policy targets or BTR pseudo-targets) with
 * optional primary-document provenance and an optional implementation-status
 * snapshot above the list. Shared by both policy-document and BTR-action data
 * source chips so the inspection UX is consistent across the two sources.
 */
function TargetListModal({ label, targets, sourceRef, implementationStat, countryConfig, onClose }: {
  label: string;
  targets: Target[];
  sourceRef?: string;
  implementationStat?: ImplementationStat;
  countryConfig?: CountryConfig | null;
  onClose: () => void;
}) {
  const nonImplemented =
    implementationStat ? implementationStat.total - implementationStat.implemented : 0;
  return (
    <Modal open={true} onClose={onClose} title={label} maxWidth="max-w-xl">
      {(sourceRef || implementationStat) && (
        <div className="px-5 pt-3 pb-2 border-b border-gray-50 space-y-1">
          {sourceRef && (
            <p className="text-[11px] text-[var(--undp-gray)] italic">
              Source: {sourceRef}
            </p>
          )}
          {implementationStat && implementationStat.total > 0 && (
            <p className="text-[11px] text-[var(--undp-gray)]">
              <span className="font-semibold text-[var(--undp-black)]">
                {implementationStat.implemented}
              </span>{" "}
              of {implementationStat.total} marked fully implemented
              {nonImplemented > 0 && (
                <>
                  {" · "}
                  {nonImplemented} reported as ongoing or planned
                </>
              )}
            </p>
          )}
        </div>
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

// ─── Drill-down chip ───────────────────────────────────────────────────────────

/**
 * Inline chip used inside the card subtitles. Renders as a button when an
 * `onClick` is supplied (drill-down available) and as a plain span otherwise
 * (so 0-count segments don't pretend to be clickable). The optional `color`
 * dot keeps mitigation/adaptation visually consistent with the rest of the
 * dashboard's BTR colours.
 */
function InspectChip({
  label,
  onClick,
  title,
  color,
}: {
  label: React.ReactNode;
  onClick?: () => void;
  title?: string;
  color?: string;
}) {
  const dot = color ? (
    <span
      className="w-1.5 h-1.5 rounded-full inline-block"
      style={{ backgroundColor: color }}
    />
  ) : null;
  if (!onClick) {
    return (
      <span className="inline-flex items-center gap-1 text-[var(--undp-gray)]" title={title}>
        {dot}
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="inline-flex items-center gap-1 underline decoration-dotted decoration-gray-300 underline-offset-2 hover:decoration-[var(--undp-blue)] hover:text-[var(--undp-blue)] transition-colors"
      style={color ? { color } : undefined}
    >
      {dot}
      {label}
    </button>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

interface DataSourcesOverviewProps {
  targets: Target[];
  /** Kept for call-site stability; not currently surfaced in the cards. */
  alignmentOpportunities?: number;
  btrData: BtrData | null;
  /** Kept for call-site stability; NR7 progress is surfaced in the dedicated Implementation Progress section below. */
  nr7Data?: Nr7Data | null;
  /**
   * Country-specific presentation config loaded from
   * `{country}-country-config.json`. Supplies provenance strings for the
   * drill-down tooltips. When null (e.g. upload flow with no config) the
   * cards still render with fallback labels and no provenance tooltips.
   */
  countryConfig?: CountryConfig | null;
}

/**
 * Top-of-dashboard "Data Sources" panel. Three cards summarise what's loaded:
 *
 * 1. **Policy Targets** — count of policy commitments across all non-BTR
 *    sources. Each document abbreviation in the subtitle is clickable and
 *    opens a modal with that document's targets + provenance citation.
 * 2. **BTR Reported Actions** — count of BTR pseudo-targets, split into
 *    mitigation and adaptation segments (clickable) so users can inspect
 *    each subset.
 * 3. **Marked Fully Implemented** — implementation status snapshot of BTR
 *    actions. The implemented count is clickable (lists the implemented
 *    actions); the "ongoing or planned" subtitle is clickable and lists the
 *    rest.
 *
 * Cards 2 and 3 only render when BTR data is present, so the upload flow
 * (which may not include BTR) gracefully shows just card 1. NR7 progress is
 * surfaced in the dedicated Implementation Progress section below the
 * dashboard and isn't duplicated here.
 */
export function DataSourcesOverview({ targets, btrData, countryConfig }: DataSourcesOverviewProps) {
  const [modal, setModal] = useState<{
    label: string;
    targets: Target[];
    sourceRef?: string;
    implementationStat?: ImplementationStat;
  } | null>(null);

  // Group policy targets by source document (BTR pseudo-targets are surfaced
  // separately in card 2). Sort by the country config's preferred order so
  // each country's own document order is honoured.
  const policyTargets = targets.filter((t) => t.sourceDocument !== "BTR");
  const targetsByDoc = new Map<PolicyDocumentType, Target[]>();
  for (const t of policyTargets) {
    const list = targetsByDoc.get(t.sourceDocument) ?? [];
    list.push(t);
    targetsByDoc.set(t.sourceDocument, list);
  }
  const policyDocTypes = Array.from(targetsByDoc.keys()).sort(
    (a, b) => getDocTypeOrder(countryConfig, a) - getDocTypeOrder(countryConfig, b),
  );
  const docProvenance = countryConfig?.docProvenance ?? {};

  // BTR pseudo-targets are already merged into `targets` by the dashboard
  // API route. Split by actionType for the mitigation / adaptation drill-downs.
  const btrMitigationTargets = targets.filter(
    (t) => t.sourceDocument === "BTR" && t.actionType !== "adaptation",
  );
  const btrAdaptationTargets = targets.filter(
    (t) => t.sourceDocument === "BTR" && t.actionType === "adaptation",
  );
  const btrMitigationCount = btrMitigationTargets.length;
  const btrAdaptationCount = btrAdaptationTargets.length;
  const totalBtrActions = btrMitigationCount + btrAdaptationCount;
  const hasBtr = totalBtrActions > 0;

  // Per-action implementation status — match BTR pseudo-targets to their
  // underlying measure by sourceLabel (which is the measure name truncated
  // to 60 chars in `measures_to_pseudo_targets`). The implemented count is
  // surfaced inside the mitigation / adaptation modals rather than as a
  // separate card so the snapshot lives next to the actions it describes.
  const measureByLabel = new Map<string, BtrData["mitigationMeasures"][number]>();
  for (const m of btrData?.mitigationMeasures ?? []) {
    if (!m.status?.trim()) continue;
    const label = m.name.length <= 60 ? m.name : m.name.slice(0, 57) + "...";
    measureByLabel.set(label, m);
  }
  const isImplemented = (t: Target): boolean => {
    const m = measureByLabel.get(t.sourceLabel);
    return Boolean(m?.status?.toLowerCase().includes("implemented"));
  };
  const mitigationImplementedCount = btrMitigationTargets.filter(isImplemented).length;
  const adaptationImplementedCount = btrAdaptationTargets.filter(isImplemented).length;

  // Provenance strings (auditable citation tooltips on each drill-down).
  const btrMitigationProvenance = formatSourceRef(countryConfig?.btrMitigationSourceRef);
  const btrAdaptationProvenance = formatSourceRef(btrData?.adaptationSourceRef);

  // Abbreviation list for the InfoBox — same dynamic logic as before so a
  // second country's document types (NP, ENR, IRMF, ...) get expanded
  // automatically when their config has full labels.
  const abbrList: { abbr: string; description: string }[] = [];
  const seenAbbrs = new Set<string>();
  for (const dt of policyDocTypes) {
    if (seenAbbrs.has(dt)) continue;
    const full = getDocFullLabel(countryConfig, dt);
    if (full !== dt) {
      abbrList.push({ abbr: dt, description: full });
      seenAbbrs.add(dt);
    }
  }
  if (hasBtr && !seenAbbrs.has("BTR")) {
    abbrList.push({
      abbr: "BTR",
      description: getDocFullLabel(countryConfig, "BTR"),
    });
  }

  // Two-card layout when BTR data is present (Policy Targets, BTR Reported
  // Actions); single full-width card otherwise. A third slot is reserved
  // mentally for a future Finance / Budget summary (BIOFIN, BTR finance
  // tables) — it was deliberately left out rather than filled with the
  // "Marked Fully Implemented" subset, which is now shown inside the BTR
  // modals next to the actions it describes.
  const gridCols = hasBtr ? "sm:grid-cols-2" : "";

  return (
    <>
      <section className="mb-8">
        <div className="flex items-baseline gap-2 mb-3">
          <h2 className="text-sm font-semibold text-[var(--undp-black)]">
            Data Sources
            <InfoBox>
              Policy commitments and reported implementation analysed in this dashboard. Click any label or count to inspect the underlying targets or actions.
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
        </div>

        <div className={`grid grid-cols-1 gap-3 ${gridCols}`}>
          {/* Card 1 — Policy Targets */}
          <div className="border border-gray-100 rounded-lg p-4 bg-white">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)]">
              Policy Targets
            </p>
            <p className="text-2xl font-semibold text-[var(--undp-black)] tabular-nums leading-tight mt-0.5">
              {policyTargets.length}
            </p>
            <p className="text-[11px] text-[var(--undp-gray)] mt-1.5 leading-relaxed">
              {policyDocTypes.length === 0 ? (
                <span className="italic">No policy targets loaded.</span>
              ) : (
                <>
                  across{" "}
                  {policyDocTypes.map((doc, i) => {
                    const fullLabel = getDocFullLabel(countryConfig, doc);
                    const docTargets = targetsByDoc.get(doc) ?? [];
                    const provenance = docProvenance[doc];
                    const title = provenance
                      ? `${fullLabel} · Source: ${provenance}`
                      : fullLabel;
                    return (
                      <span key={doc}>
                        <InspectChip
                          label={getDocLabel(countryConfig, doc)}
                          title={title}
                          color={getDocColor(countryConfig, doc)}
                          onClick={() =>
                            setModal({
                              label: fullLabel,
                              targets: docTargets,
                              sourceRef: provenance,
                            })
                          }
                        />
                        {i < policyDocTypes.length - 1 ? ", " : ""}
                      </span>
                    );
                  })}
                </>
              )}
            </p>
          </div>

          {/* Card 2 — BTR Reported Actions (only when BTR data is present) */}
          {hasBtr && (
            <div className="border border-gray-100 rounded-lg p-4 bg-white">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)]">
                BTR Reported Actions
              </p>
              <p className="text-2xl font-semibold text-[var(--undp-black)] tabular-nums leading-tight mt-0.5">
                {totalBtrActions}
              </p>
              <p className="text-[11px] text-[var(--undp-gray)] mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                {btrMitigationCount > 0 && (
                  <InspectChip
                    label={`${btrMitigationCount} mitigation`}
                    color={BTR_MITIGATION_COLOR}
                    title={
                      btrMitigationProvenance
                        ? `BTR Reported Mitigation Actions · Source: ${btrMitigationProvenance}`
                        : "BTR Reported Mitigation Actions"
                    }
                    onClick={() =>
                      setModal({
                        label: "BTR Reported Mitigation Actions",
                        targets: btrMitigationTargets,
                        sourceRef: btrMitigationProvenance,
                        implementationStat: {
                          implemented: mitigationImplementedCount,
                          total: btrMitigationCount,
                        },
                      })
                    }
                  />
                )}
                {btrMitigationCount > 0 && btrAdaptationCount > 0 && (
                  <span className="text-gray-300">·</span>
                )}
                {btrAdaptationCount > 0 && (
                  <InspectChip
                    label={`${btrAdaptationCount} adaptation`}
                    color={BTR_ADAPTATION_COLOR}
                    title={
                      btrAdaptationProvenance
                        ? `BTR Reported Adaptation Actions · Source: ${btrAdaptationProvenance}`
                        : "BTR Reported Adaptation Actions"
                    }
                    onClick={() =>
                      setModal({
                        label: "BTR Reported Adaptation Actions",
                        targets: btrAdaptationTargets,
                        sourceRef: btrAdaptationProvenance,
                        implementationStat: {
                          implemented: adaptationImplementedCount,
                          total: btrAdaptationCount,
                        },
                      })
                    }
                  />
                )}
              </p>
            </div>
          )}
        </div>
      </section>

      {modal && (
        <TargetListModal
          label={modal.label}
          targets={modal.targets}
          sourceRef={modal.sourceRef}
          implementationStat={modal.implementationStat}
          countryConfig={countryConfig}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
