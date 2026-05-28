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
}: {
  targets: Target[];
  alignment: AlignmentResult[];
  countryConfig: CountryConfig | null;
  focusedDoc: PolicyDocumentType;
  availableDocs: PolicyDocumentType[];
  onSelectDoc: (d: PolicyDocumentType) => void;
  /** Open the pair drawer for a flagged target pair. */
  onOpenPair: (aId: string, bId: string) => void;
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
  const headline =
    headlineData.flaggedRecordCount === 0
      ? `${label} reads as a reinforcing thread.`
      : headlineData.alignedRecordCount === 0
        ? `${label} carries the friction on its own.`
        : `${label} reinforces with most other documents, with friction in places.`;
  // We used to name the strongest-reinforcing and most-flagged peers
  // here, but both metrics scale with the peer's target count so the
  // "winner" was effectively whichever doc was largest. The wheel's
  // balance bands surface the per-peer balance honestly; the prose
  // sticks to corpus-level counts that ARE meaningful at the doc level.
  return {
    headline,
    body:
      `${label} sits with ${peers} other document${headlineData.peripheralDocCount === 1 ? "" : "s"}. ` +
      `${aligned} of its scored pairs reach medium or strong alignment; ${flagged} are flagged for review.`,
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
}: {
  fullTitle: string;
  label: string;
  frictions: DocFocusFrictions;
  focusedDoc: PolicyDocumentType;
  countryConfig: CountryConfig | null;
  onOpenPair: (aId: string, bId: string) => void;
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
          No cross-document pairs involving {label} are flagged for review.
        </p>
      ) : (
        <>
          {frictionTotals.total > 0 && (
            <FrictionTypeChart
              totals={frictionTotals}
              caption={`How ${label}'s flags break down`}
            />
          )}
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-2">
              Where {label} is flagged for review
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
                + {remainder.toLocaleString()} more flagged pair
                {remainder === 1 ? "" : "s"} involving {label}
              </p>
            )}
            <p className="mt-3 text-[10px] text-[var(--undp-gray)] leading-relaxed">
              Flagged for review, not settled findings. Open a pair for the
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
  // The peer side is whichever target is NOT in the focused document.
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
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)]">
            vs {peerDocLabel}
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
          {peer.text}
        </p>
      </button>
    </li>
  );
}
