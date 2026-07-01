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

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { SlideFrame } from "../slide-frame";
import { FrictionTypeChart } from "../centerpiece/friction-type-chart";
import { DocInfoPopover } from "../doc-meta-card";
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

const HEADLINE_SERIF =
  "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif";
/** How many flagged pairs to list before collapsing into a "+N more" note. */
const FLAGGED_CAP = 6;

export function DocFocusSection({
  targets,
  alignment,
  countryConfig,
  focusedDoc,
  availableDocs,
  onSelectDoc,
  onOpenPair,
  onOpenType,
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
      eyebrow={t("eyebrow")}
      headline={sentence.headline}
      body={sentence.body}
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
    >
      <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mr-2">
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
            className={`px-2.5 py-1 rounded text-[12px] font-medium transition-colors ${
              isActive
                ? "bg-[var(--undp-black)] text-white"
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
  frictions: DocFocusFrictions;
  focusedDoc: PolicyDocumentType;
  countryConfig: CountryConfig | null;
  onOpenPair: (aId: string, bId: string) => void;
  onOpenType: (mechanism: AlignmentMechanism) => void;
}) {
  const t = useTranslations("briefing.docFocus");
  const { flaggedPairs, frictionTotals } = frictions;
  const shown = flaggedPairs.slice(0, FLAGGED_CAP);
  const remainder = flaggedPairs.length - shown.length;
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-1">
          {t("fullTitle")}
        </p>
        <DocInfoPopover
          meta={meta}
          color={getDocColor(countryConfig, focusedDoc)}
          deadlineCoverage={deadlineCoverage}
        >
          <span className="text-[14px] text-[var(--undp-black)] leading-snug group-hover:underline underline-offset-2 decoration-1">
            {fullTitle}
          </span>
        </DocInfoPopover>
      </div>

      {flaggedPairs.length === 0 ? (
        <p className="text-[12px] italic text-[var(--undp-gray)]">
          {t("noMisalignment", { label })}
        </p>
      ) : (
        <>
          {frictionTotals.total > 0 && (
            <FrictionTypeChart
              totals={frictionTotals}
              caption={t("breakdownCaption", { label })}
              onSegmentClick={onOpenType}
            />
          )}
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-2">
              {t("whereShowsMisalignment", { label })}
            </p>
            <ul className="divide-y divide-gray-200 border-y border-gray-200">
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
              <p className="mt-2 text-[10.5px] text-[var(--undp-gray)] tabular-nums">
                {t("morePairs", { count: remainder, label })}
              </p>
            )}
            <p className="mt-3 text-[10px] text-[var(--undp-gray)] leading-relaxed">
              {t("notSettledFindings")}
            </p>
          </div>
        </>
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
  // The serif text is the focused document's own target (the thing being
  // flagged); name it explicitly as "<focused doc> target" so it's never
  // ambiguous whose target the reader is looking at. The peer side supplies the
  // "vs <doc> target" counterpart line.
  const focused =
    line.targetA.sourceDocument === focusedDoc ? line.targetA : line.targetB;
  const peer =
    line.targetA.sourceDocument === focusedDoc ? line.targetB : line.targetA;
  const focusedDocLabel = getDocMediumLabel(countryConfig, focusedDoc);
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
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)]">
            {t("targetSide", { doc: focusedDocLabel })}
          </span>
          {mechanism && (
            <span
              className="text-[9.5px] uppercase tracking-wider font-semibold shrink-0"
              style={{ color: MECHANISM_COLORS[mechanism] }}
            >
              {contradictionLabels[mechanism]}
            </span>
          )}
        </div>
        <p
          className="text-[12.5px] text-[var(--undp-black)] leading-snug overflow-hidden"
          style={{
            fontFamily: HEADLINE_SERIF,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {focused.text}
        </p>
        <p className="mt-1.5 text-[10px] uppercase tracking-wider text-[var(--undp-gray)]">
          {t("peerSide", { doc: peerDocLabel })}
        </p>
      </button>
    </li>
  );
}

/* Per-document reference metadata + deadline coverage now render via the shared
 * DocMetaCard (see ../doc-meta-card), used here in the left column and as a
 * hover card on the wheel's document legend. */
