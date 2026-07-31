"use client";

/**
 * Doc-in-Focus — second scrollable section. Answers "how coherent is
 * each policy with the others?" by picking one document at a time and
 * showing genuinely per-document substance:
 *
 *   • Dynamic headline + body driven by buildAnchorHeadline
 *   • Doc switcher (segmented control of all available docs)
 *   • The friction-type split of this document's flagged pairs
 *   • The specific flagged pairs this document is part of → pair drawer
 *
 * Themes are NOT re-listed here. They live once, on the Direction slide
 * (the recurring-patterns block). Re-listing the corpus storylines
 * filtered to the focused doc read as a duplicate of that block with an
 * ambiguous scope, so this slide now carries doc-specific evidence the
 * theme list never did.
 *
 * Pairs with the wheel in the right column: when this slide is active
 * the wheel auto-focuses the selected doc and renders per-peer balance
 * bands. The wheel's centre readout is suppressed here so the rim
 * labels stay clean (the same information is carried in this column).
 *
 * Earlier iterations surfaced a "Strongest reinforcement" /
 * "Most flagged" peer card pair; both metrics scale with peer-doc
 * target counts and so favour whichever doc happens to be largest.
 * Removed (May 2026) because they read as a misleading "winner". The
 * wheel's balance bands now carry that per-peer balance signal without
 * naming a "winner" the absolute counts don't actually support.
 */

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { SlideFrame } from "../slide-frame";
import { DocInfoPopover } from "../doc-meta-card";
import { ViewTargetsAction } from "../view-targets-action";
import { TourButton } from "../tour/tour-button";
import {
  buildAnchorHeadline,
  buildDocFocusFrictions,
  type AnchorHeadline,
  type DocFocusFrictions,
  type FaultLine,
} from "@/lib/coherence-briefing";
import {
  MECHANISM_COLORS,
  getDocColor,
  getDocFullLabel,
  getDocMediumLabel,
  getDocMeta,
  type DocMeta,
} from "@/lib/utils";
import { useContradictionTypeLabels } from "@/lib/labels";
import type {
  AlignmentMechanism,
  AlignmentResult,
  CountryConfig,
  PolicyDocumentType,
  Target,
} from "@/types";

export const DOC_FOCUS_SECTION_ID = "doc-focus";

/** How many flagged pairs to list before the "Show all" expander. */
const FLAGGED_CAP = 5;

export function DocFocusSection({
  targets,
  alignment,
  countryConfig,
  focusedDoc,
  availableDocs,
  onSelectDoc,
  onOpenPair,
  onOpenType,
  onViewTargets,
}: {
  targets: Target[];
  alignment: AlignmentResult[];
  countryConfig: CountryConfig | null;
  focusedDoc: PolicyDocumentType;
  availableDocs: PolicyDocumentType[];
  onSelectDoc: (d: PolicyDocumentType) => void;
  /** Open the pair drawer for a flagged target pair. */
  onOpenPair: (aId: string, bId: string) => void;
  /** Open the doc-scoped decomposition drawer for a friction mechanism. */
  onOpenType: (mechanism: AlignmentMechanism) => void;
  /** Open the focused document's own targets. */
  onViewTargets: (doc: PolicyDocumentType) => void;
}) {
  const t = useTranslations("briefing.docFocus");
  const headlineData = useMemo<AnchorHeadline>(
    () =>
      buildAnchorHeadline({
        targets,
        alignment,
        countryConfig,
        anchorDocTypeOverride: focusedDoc,
      }),
    [targets, alignment, countryConfig, focusedDoc],
  );

  const frictions = useMemo<DocFocusFrictions>(
    () => buildDocFocusFrictions(alignment, targets, focusedDoc),
    [alignment, targets, focusedDoc],
  );

  const fullTitle = getDocFullLabel(countryConfig, focusedDoc);
  const label =
    headlineData.anchorName ?? getDocMediumLabel(countryConfig, focusedDoc);
  const sentence = composeFocusedDocSentence({
    focusedDoc,
    headlineData,
    countryConfig,
    t,
  });
  const meta = getDocMeta(countryConfig, focusedDoc);
  // Re-surface the deadlines the pipeline already extracts (Target.isTimeBound)
  // as a per-document coverage count. No new methodology: existing data only.
  const deadlineCoverage = useMemo(() => {
    const docTargets = targets.filter((tt) => tt.sourceDocument === focusedDoc);
    return {
      total: docTargets.length,
      timeBound: docTargets.filter((tt) => tt.isTimeBound).length,
    };
  }, [targets, focusedDoc]);

  return (
    <SlideFrame
      id={DOC_FOCUS_SECTION_ID}
      headline={sentence.headline}
      body={sentence.body}
      tourButton={<TourButton tourId="docFocus" scopeId={DOC_FOCUS_SECTION_ID} />}
      controls={
        <DocSwitcher
          availableDocs={availableDocs}
          activeDoc={focusedDoc}
          onSelect={onSelectDoc}
          countryConfig={countryConfig}
        />
      }
      evidence={
        <DocFocusEvidence
          fullTitle={fullTitle}
          label={label}
          meta={meta}
          deadlineCoverage={deadlineCoverage}
          onViewTargets={onViewTargets}
          frictions={frictions}
          focusedDoc={focusedDoc}
          countryConfig={countryConfig}
          onOpenPair={onOpenPair}
          onOpenType={onOpenType}
        />
      }
    />
  );
}

function composeFocusedDocSentence({
  focusedDoc,
  headlineData,
  countryConfig,
  t,
}: {
  focusedDoc: PolicyDocumentType;
  headlineData: AnchorHeadline;
  countryConfig: CountryConfig | null;
  t: ReturnType<typeof useTranslations<"briefing.docFocus">>;
}): { headline: string; body: string } {
  const label =
    headlineData.anchorName ?? getDocMediumLabel(countryConfig, focusedDoc);
  if (!headlineData.isAnchored) {
    return {
      headline: t("notAnchored.headline", { label }),
      body: t("notAnchored.body", { label }),
    };
  }
  const aligned = headlineData.alignedRecordCount;
  const flagged = headlineData.flaggedRecordCount;
  const peers = headlineData.peripheralDocCount;
  const total = aligned + flagged;
  const share = total > 0 ? flagged / total : 0;
  const MISALIGN_SHARE_SOME = 0.15;
  const MISALIGN_SHARE_SUBSTANTIAL = 0.3;
  const MISALIGN_SHARE_DOMINANT = 0.5;
  let headlineKey: string;
  if (total === 0) {
    headlineKey = "headline.noLinks";
  } else if (flagged === 0) {
    headlineKey = "headline.fullyAligned";
  } else if (aligned === 0) {
    headlineKey = "headline.fullyMisaligned";
  } else if (share < MISALIGN_SHARE_SOME) {
    headlineKey = "headline.minimalMisalignment";
  } else if (share < MISALIGN_SHARE_SUBSTANTIAL) {
    headlineKey = "headline.someMisalignment";
  } else if (share < MISALIGN_SHARE_DOMINANT) {
    headlineKey = "headline.substantialMisalignment";
  } else {
    headlineKey = "headline.moreOftenMisaligned";
  }
  return {
    headline: t(headlineKey, { label }),
    body: t("body", { label, peers, aligned, flagged }),
  };
}

function DocSwitcher({
  availableDocs,
  activeDoc,
  onSelect,
  countryConfig,
}: {
  availableDocs: PolicyDocumentType[];
  activeDoc: PolicyDocumentType;
  onSelect: (d: PolicyDocumentType) => void;
  countryConfig: CountryConfig | null;
}) {
  const t = useTranslations("briefing.docFocus");
  // Lead with the country's anchor doc (Vision 2050 in Mongolia) so the
  // strategic anchor is the first thing the user sees, then alphabetical
  // for the rest. Falls back gracefully when no anchor is configured.
  const anchor = countryConfig?.anchorDocType ?? null;
  const ordered = (() => {
    if (!anchor || !availableDocs.includes(anchor)) return availableDocs;
    const rest = availableDocs.filter((d) => d !== anchor);
    return [anchor, ...rest];
  })();
  return (
    <div
      role="group"
      aria-label={t("switcherAriaLabel")}
      className="flex flex-wrap items-center gap-1.5"
      data-tour="doc-switcher"
    >
      <span className="text-caption text-[var(--undp-gray)] mr-2">
        {t("focusOn")}
      </span>
      {ordered.map((d) => {
        const isActive = d === activeDoc;
        return (
          <button
            key={d}
            type="button"
            onClick={() => onSelect(d)}
            aria-pressed={isActive}
            title={getDocFullLabel(countryConfig, d)}
            className={`px-2.5 py-1 rounded text-data font-medium transition-colors ${
              isActive
                ? "bg-[var(--undp-blue)] text-white"
                : "border border-gray-200 text-[var(--undp-gray)] hover:border-gray-400 hover:text-[var(--undp-black)]"
            }`}
          >
            {getDocMediumLabel(countryConfig, d)}
          </button>
        );
      })}
    </div>
  );
}

function DocFocusEvidence({
  fullTitle,
  label,
  meta,
  deadlineCoverage,
  onViewTargets,
  frictions,
  focusedDoc,
  countryConfig,
  onOpenPair,
  onOpenType,
}: {
  fullTitle: string;
  label: string;
  meta: DocMeta;
  deadlineCoverage: { total: number; timeBound: number };
  onViewTargets: (doc: PolicyDocumentType) => void;
  frictions: DocFocusFrictions;
  focusedDoc: PolicyDocumentType;
  countryConfig: CountryConfig | null;
  onOpenPair: (aId: string, bId: string) => void;
  onOpenType: (mechanism: AlignmentMechanism) => void;
}) {
  const t = useTranslations("briefing.docFocus");
  const contradictionLabels = useContradictionTypeLabels();
  const [showAll, setShowAll] = useState(false);
  const { flaggedPairs, frictionTotals } = frictions;
  const shown = showAll ? flaggedPairs : flaggedPairs.slice(0, FLAGGED_CAP);
  const remainder = flaggedPairs.length - FLAGGED_CAP;
  const dominant = frictionTotals.dominantType;
  return (
    <div className="space-y-5">
      <DocInfoPopover
        footer={
          <ViewTargetsAction
            count={deadlineCoverage.total}
            onClick={() => onViewTargets(focusedDoc)}
          />
        }
        meta={meta}
        color={getDocColor(countryConfig, focusedDoc)}
        deadlineCoverage={deadlineCoverage}
      >
        <span className="text-caption text-[var(--undp-gray)] leading-snug group-hover:underline underline-offset-2 decoration-1">
          {fullTitle}
        </span>
      </DocInfoPopover>

      {flaggedPairs.length === 0 ? (
        <p className="text-caption text-[var(--undp-gray)]">
          {t("noMisalignment", { label })}
        </p>
      ) : (
        <div>
          <p className="text-caption font-medium text-[var(--undp-gray)] mb-2">
            {t("whereShowsMisalignment", { label })}
          </p>
          <ul
            className="divide-y divide-gray-200 border-y border-gray-200"
            data-tour="flagged-pairs"
          >
            {shown.map((line) => (
              <FlaggedPairRow
                key={`${line.pair.targetAId}__${line.pair.targetBId}`}
                line={line}
                focusedDoc={focusedDoc}
                countryConfig={countryConfig}
                onOpen={() =>
                  onOpenPair(line.pair.targetAId, line.pair.targetBId)
                }
              />
            ))}
          </ul>
          {remainder > 0 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-2 text-caption text-[var(--undp-gray)] hover:text-[var(--undp-black)] underline underline-offset-2 tabular-nums"
            >
              {showAll
                ? t("showFewer")
                : t("showAll", { count: flaggedPairs.length })}
            </button>
          )}
          {/* The per-mechanism breakdown chart lives once, on the friction-types
              slide; here one sentence names the dominant kind and links the
              doc-scoped decomposition drawer. */}
          {frictionTotals.total > 0 && dominant && (
            <p className="mt-3">
              <button
                type="button"
                onClick={() => onOpenType(dominant)}
                className="text-left text-caption text-[var(--undp-gray)] hover:text-[var(--undp-black)] underline underline-offset-2 decoration-1"
              >
                {t("dominantMechanism", {
                  label,
                  mechanism: contradictionLabels[dominant].toLowerCase(),
                })}
              </button>
            </p>
          )}
          <p className="mt-3 text-caption text-[var(--undp-gray)] leading-relaxed">
            {t("notSettledFindings")}
          </p>
        </div>
      )}
    </div>
  );
}

function FlaggedPairRow({
  line,
  focusedDoc,
  countryConfig,
  onOpen,
}: {
  line: FaultLine;
  focusedDoc: PolicyDocumentType;
  countryConfig: CountryConfig | null;
  onOpen: () => void;
}) {
  const t = useTranslations("briefing.docFocus");
  const contradictionLabels = useContradictionTypeLabels();
  // The list header names the focused document; each row shows that document's
  // own target text, with the peer document and the friction mechanism on one
  // quiet counterpart line.
  const focused =
    line.targetA.sourceDocument === focusedDoc ? line.targetA : line.targetB;
  const peer =
    line.targetA.sourceDocument === focusedDoc ? line.targetB : line.targetA;
  const peerDocLabel = getDocMediumLabel(
    countryConfig,
    peer.sourceDocument as PolicyDocumentType,
  );
  const mechanism = line.pair.mechanism;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-left py-2.5 px-1 rounded hover:bg-gray-50 transition-colors"
      >
        <p
          className="text-data text-[var(--undp-black)] leading-snug overflow-hidden"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {focused.text}
        </p>
        <p className="mt-1 flex items-baseline justify-between gap-2 text-caption text-[var(--undp-gray)]">
          <span>{t("peerSide", { doc: peerDocLabel })}</span>
          {mechanism && (
            <span
              className="shrink-0 font-medium"
              style={{ color: MECHANISM_COLORS[mechanism] }}
            >
              {contradictionLabels[mechanism]}
            </span>
          )}
        </p>
      </button>
    </li>
  );
}

/* Per-document reference metadata + deadline coverage now render via the shared
 * DocMetaCard (see ../doc-meta-card), used here in the left column and as a
 * hover card on the wheel's document legend. */
