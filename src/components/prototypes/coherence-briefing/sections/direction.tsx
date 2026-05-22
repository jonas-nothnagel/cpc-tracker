"use client";

/**
 * Direction section — Section 1 of the findings home.
 *
 * Paragraph claim about whether the country's policies broadly pull the same
 * direction. When the country has a configured anchor doc, the paragraph
 * centres on that doc ("Vision 2050 sits at the centre…"); otherwise it falls
 * back to a doc-agnostic verdict sentence. Below the paragraph: a small
 * collapsible "what you are looking at" block with one aligned + one flagged
 * primer pair (each opens the pair drawer for full text + AI rationale).
 */

import { useState } from "react";
import { PrimerCard, type PrimerHighlightPair } from "../primer-card";
import {
  type AnchorHeadline,
  type FaultLine,
  type HeadlineVerdict,
  type PrimerExamples,
  type VerdictBucket,
} from "@/lib/coherence-briefing";
import { ALIGNMENT_COLORS } from "@/lib/utils";
import type { CountryConfig } from "@/types";

export const DIRECTION_SECTION_ID = "direction";

const HEADLINE_SERIF =
  "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif";
const PRIMER_STORAGE_KEY = "cpc.briefing.primer-collapsed";

export function DirectionSection({
  countryName,
  documentCount,
  anchor,
  verdict,
  primer,
  countryConfig,
  onOpenPair,
  onHighlightPair,
}: {
  countryName: string;
  documentCount: number;
  anchor: AnchorHeadline;
  verdict: HeadlineVerdict;
  primer: PrimerExamples;
  countryConfig: CountryConfig | null;
  onOpenPair: (line: FaultLine) => void;
  onHighlightPair?: (pair: PrimerHighlightPair | null) => void;
}) {
  const sentence = composeDirectionSentence({
    countryName,
    documentCount,
    anchor,
    verdict,
  });
  // Default open; honour the localStorage flag set after first visit.
  // Lazy initializer runs once and is SSR-safe (typeof window guard); the
  // primer block is below the fold so a one-frame hydration mismatch is
  // acceptable.
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(PRIMER_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(PRIMER_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Ignore.
      }
      return next;
    });
  };

  return (
    <section
      id={DIRECTION_SECTION_ID}
      className="scroll-mt-24 pt-2"
      aria-labelledby={`${DIRECTION_SECTION_ID}-heading`}
    >
      <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--undp-gray)] mb-2">
        Are these policies pulling the same direction?
      </p>
      <h2
        id={`${DIRECTION_SECTION_ID}-heading`}
        className="text-[28px] sm:text-[32px] leading-[1.15] text-[var(--undp-black)] font-medium mb-4"
        style={{ fontFamily: HEADLINE_SERIF }}
      >
        {sentence.headline}
      </h2>
      <p className="text-[15px] leading-relaxed text-[var(--undp-black)] max-w-prose mb-4">
        {sentence.body}
      </p>
      <div className="mb-6">
        <VerdictBadge bucket={verdict.bucket} />
      </div>

      <div className="border-t border-gray-200 pt-4">
        <button
          type="button"
          onClick={toggle}
          className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--undp-gray)] hover:text-[var(--undp-black)] transition-colors"
          aria-expanded={!collapsed}
          aria-controls={`${DIRECTION_SECTION_ID}-primer`}
        >
          <span aria-hidden="true" className="text-[10px]">
            {collapsed ? "▸" : "▾"}
          </span>
          What you are looking at
        </button>
        {!collapsed && (
          <div
            id={`${DIRECTION_SECTION_ID}-primer`}
            className="mt-3 grid gap-3 sm:grid-cols-2"
          >
            {primer.aligned && (
              <PrimerCard
                kind="aligned"
                line={primer.aligned}
                countryConfig={countryConfig}
                onSelect={() => onOpenPair(primer.aligned!)}
                onHoverChange={onHighlightPair}
              />
            )}
            {primer.tension && (
              <PrimerCard
                kind="flagged"
                line={primer.tension}
                countryConfig={countryConfig}
                onSelect={() => onOpenPair(primer.tension!)}
                onHoverChange={onHighlightPair}
              />
            )}
            {!primer.aligned && !primer.tension && (
              <p className="text-xs italic text-[var(--undp-gray)] sm:col-span-2">
                Not enough scored pairs to show a primer.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

interface DirectionSentence {
  headline: string;
  body: string;
}

function composeDirectionSentence({
  countryName,
  documentCount,
  anchor,
  verdict,
}: {
  countryName: string;
  documentCount: number;
  anchor: AnchorHeadline;
  verdict: HeadlineVerdict;
}): DirectionSentence {
  // Headline is the verdict's three-bucket assertion.
  const headline = verdict.headline;
  // Body composes the supporting claim. When we have an anchor, we lead with
  // the anchor; otherwise we fall back to corpus-level counts.
  const docPhrase =
    documentCount === 1
      ? "1 document"
      : `${documentCount.toLocaleString()} documents`;
  if (anchor.isAnchored && anchor.anchorName) {
    const clauses: string[] = [];
    clauses.push(`${countryName} has been compared across ${docPhrase}.`);
    const supportClause =
      anchor.alignedRecordCount > 0
        ? `${anchor.alignedRecordCount.toLocaleString()} of ${anchor.anchorName}'s links to other documents reach medium or strong alignment`
        : null;
    const flagClause =
      anchor.flaggedRecordCount > 0
        ? `${anchor.flaggedRecordCount.toLocaleString()} are possible misalignments worth a closer look`
        : null;
    if (supportClause && flagClause) {
      clauses.push(`${supportClause} and ${flagClause}.`);
    } else if (supportClause) {
      clauses.push(`${supportClause}.`);
    } else if (flagClause) {
      clauses.push(
        `${anchor.anchorName} has ${anchor.flaggedRecordCount.toLocaleString()} possible misalignments with other documents worth a closer look.`,
      );
    }
    if (anchor.mostFlaggedPeripheral) {
      clauses.push(
        `The strongest friction is with ${anchor.mostFlaggedPeripheral.label} (${anchor.mostFlaggedPeripheral.flaggedCount} flagged pair${anchor.mostFlaggedPeripheral.flaggedCount === 1 ? "" : "s"}).`,
      );
    } else if (anchor.strongestPeripheral) {
      clauses.push(
        `Strongest alignment is with ${anchor.strongestPeripheral.label}.`,
      );
    }
    return { headline, body: clauses.join(" ") };
  }
  // Fallback: doc-agnostic counts.
  const aligned = verdict.alignmentPairs.toLocaleString();
  const flagged = verdict.tensionPairs.toLocaleString();
  const denom = (verdict.alignmentPairs + verdict.tensionPairs).toLocaleString();
  return {
    headline,
    body:
      `Across ${docPhrase} from ${countryName}, ${denom} pairs of targets were scored. ` +
      `${aligned} show medium or strong alignment; ${flagged} are flagged as possible misalignments.`,
  };
}

function VerdictBadge({ bucket }: { bucket: VerdictBucket }) {
  const palette: Record<VerdictBucket, { color: string; label: string }> = {
    mostly_aligned: { color: ALIGNMENT_COLORS.high, label: "Mostly aligned" },
    mixed: { color: ALIGNMENT_COLORS.medium, label: "Mixed signals" },
    lots_of_misalignment: {
      color: ALIGNMENT_COLORS.possible_conflict,
      label: "Substantial possible misalignment",
    },
  };
  const p = palette[bucket];
  return (
    <span
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold uppercase tracking-wider"
      style={{
        backgroundColor: `${p.color}1a`,
        color: p.color,
        border: `1px solid ${p.color}55`,
      }}
    >
      <span
        className="block w-2 h-2 rounded-full"
        style={{ backgroundColor: p.color }}
        aria-hidden="true"
      />
      {p.label}
    </span>
  );
}
