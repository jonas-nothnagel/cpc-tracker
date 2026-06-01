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
import { SlideFrame } from "../slide-frame";
import { FrictionTypeChart } from "../centerpiece/friction-type-chart";
import {
  buildAnchorHeadline,
  buildDocFocusFrictions,
  type AnchorHeadline,
  type DocFocusFrictions,
  type FaultLine,
} from "@/lib/coherence-briefing";
import {
  CONTRADICTION_TYPE_LABELS,
  MECHANISM_COLORS,
  getDocFullLabel,
  getDocMediumLabel,
} from "@/lib/utils";
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
  });

  return (
    <SlideFrame
      id={DOC_FOCUS_SECTION_ID}
      eyebrow="How coherent is each policy with the others?"
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
}: {
  focusedDoc: PolicyDocumentType;
  headlineData: AnchorHeadline;
  countryConfig: CountryConfig | null;
}): { headline: string; body: string } {
  const label =
    headlineData.anchorName ?? getDocMediumLabel(countryConfig, focusedDoc);
  if (!headlineData.isAnchored) {
    return {
      headline: `${label} sits outside the scored set so far.`,
      body: `No scored target pairs link ${label} to other documents in the current dataset.`,
    };
  }
  const aligned = headlineData.alignedRecordCount.toLocaleString();
  const flagged = headlineData.flaggedRecordCount.toLocaleString();
  const peers = headlineData.peripheralDocCount.toLocaleString();
  // Scale the headline to this document's own balance so each document reads
  // differently and the magnitude of potential misalignment is always stated
  // (qualitatively; the body line below carries the exact counts). `share` is
  // the per-document analogue of the corpus verdict's tensionShare; the cut
  // points mirror pickHeadlineVerdict (0.15 / 0.30) plus a 0.50 "more
  // misaligned than aligned" tier. Fixed ratios for now (memory
  // feedback_data_driven_scoring: revisit with >2 countries). We deliberately
  // do NOT name the worst peer here — absolute per-peer counts scale with doc
  // size, and the pairs list below already names the specific documents.
  const total =
    headlineData.alignedRecordCount + headlineData.flaggedRecordCount;
  const share = total > 0 ? headlineData.flaggedRecordCount / total : 0;
  const MISALIGN_SHARE_SOME = 0.15;
  const MISALIGN_SHARE_SUBSTANTIAL = 0.3;
  const MISALIGN_SHARE_DOMINANT = 0.5;
  let headline: string;
  if (total === 0) {
    headline = `${label} has no scored links to other documents yet.`;
  } else if (headlineData.flaggedRecordCount === 0) {
    headline = `${label} aligns with every other document in the set.`;
  } else if (headlineData.alignedRecordCount === 0) {
    headline = `${label} is misaligned across all its scored links.`;
  } else if (share < MISALIGN_SHARE_SOME) {
    headline = `${label} is strongly aligned with the rest, with only minimal potential misalignment.`;
  } else if (share < MISALIGN_SHARE_SUBSTANTIAL) {
    headline = `${label} is broadly aligned with the rest, with some potential misalignment.`;
  } else if (share < MISALIGN_SHARE_DOMINANT) {
    headline = `${label} is aligned with the rest but carries a substantial amount of potential misalignment.`;
  } else {
    headline = `${label} is more often misaligned than aligned with the rest of the set.`;
  }
  return {
    headline,
    body:
      `${label} sits with ${peers} other document${headlineData.peripheralDocCount === 1 ? "" : "s"}. ` +
      `${aligned} of its scored pairs reach strong alignment; ${flagged} show potential misalignment.`,
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
      aria-label="Pick a document to focus on"
      className="flex flex-wrap items-center gap-1.5"
    >
      <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mr-2">
        Focus on
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
  frictions,
  focusedDoc,
  countryConfig,
  onOpenPair,
  onOpenType,
}: {
  fullTitle: string;
  label: string;
  frictions: DocFocusFrictions;
  focusedDoc: PolicyDocumentType;
  countryConfig: CountryConfig | null;
  onOpenPair: (aId: string, bId: string) => void;
  onOpenType: (mechanism: AlignmentMechanism) => void;
}) {
  const { flaggedPairs, frictionTotals } = frictions;
  const shown = flaggedPairs.slice(0, FLAGGED_CAP);
  const remainder = flaggedPairs.length - shown.length;
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-1">
          Full title
        </p>
        <p className="text-[14px] text-[var(--undp-black)] leading-snug">
          {fullTitle}
        </p>
      </div>

      {flaggedPairs.length === 0 ? (
        <p className="text-[12px] italic text-[var(--undp-gray)]">
          No potential misalignment links {label} to other documents.
        </p>
      ) : (
        <>
          {frictionTotals.total > 0 && (
            <FrictionTypeChart
              totals={frictionTotals}
              caption={`How ${label}'s potential misalignment breaks down`}
              onSegmentClick={onOpenType}
            />
          )}
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-2">
              Where {label} shows potential misalignment
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
                + {remainder.toLocaleString()} more potentially misaligned pair
                {remainder === 1 ? "" : "s"} involving {label}
              </p>
            )}
            <p className="mt-3 text-[10px] text-[var(--undp-gray)] leading-relaxed">
              Potential misalignment, not settled findings. Open a pair for the
              underlying targets.
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
            {focusedDocLabel} target
          </span>
          {mechanism && (
            <span
              className="text-[9.5px] uppercase tracking-wider font-semibold shrink-0"
              style={{ color: MECHANISM_COLORS[mechanism] }}
            >
              {CONTRADICTION_TYPE_LABELS[mechanism]}
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
          vs {peerDocLabel} target
        </p>
      </button>
    </li>
  );
}
