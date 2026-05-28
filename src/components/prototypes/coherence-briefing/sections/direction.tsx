"use client";

/**
 * Direction — first scrollable section. Answers "are these policies
 * coherent with each other?" at the corpus level in one tight prose
 * block.
 *
 * Per round-3 feedback (May 2026): the slide used to stack three
 * different formats (stats strip, AI-synthesis paragraph, storyline
 * cards). For non-technical policymakers that was overstimulating.
 * Everything now collapses into a single synthesis sentence in the
 * SlideFrame body, with the two leading storyline names embedded as
 * inline-clickable buttons. The full storyline list is one link away.
 *
 * Numbers in the body are deterministic from the alignment data; the
 * storyline names are LLM-derived (`corpus_themes.json`) and refresh
 * when the synthesis pipeline re-runs. PrimerDisclosure stays for
 * reviewers who want to see one underlying scored pair from each
 * polarity.
 */

import { useState } from "react";
import { SlideFrame } from "../slide-frame";
import { PrimerCard, type PrimerHighlightPair } from "../primer-card";
import { StorylineCard } from "../storyline-card";
import {
  type FaultLine,
  type HeadlineVerdict,
  type PrimerExamples,
  type TargetConcentration,
} from "@/lib/coherence-briefing";
import type {
  CorpusStoryline,
  CorpusThemes,
  CountryConfig,
} from "@/types";

export const DIRECTION_SECTION_ID = "direction";

const PRIMER_STORAGE_KEY = "cpc.briefing.primer-collapsed";
const CONFIDENCE_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function DirectionSection({
  countryName,
  documentCount,
  verdict,
  concentration,
  primer,
  countryConfig,
  corpusThemes,
  onOpenStoryline,
  onOpenPair,
  onHighlightPair,
}: {
  countryName: string;
  documentCount: number;
  verdict: HeadlineVerdict;
  concentration: TargetConcentration;
  primer: PrimerExamples;
  countryConfig: CountryConfig | null;
  corpusThemes: CorpusThemes | null;
  onOpenStoryline: (s: CorpusStoryline) => void;
  onOpenPair: (line: FaultLine) => void;
  onHighlightPair?: (pair: PrimerHighlightPair | null) => void;
}) {
  const storylines = pickStorylinePreview(corpusThemes?.storylines ?? []);

  const synthesis = (
    <SynthesisSentence
      countryName={countryName}
      documentCount={documentCount}
      verdict={verdict}
      concentration={concentration}
      reinforce={storylines.reinforce}
      friction={storylines.friction}
      onOpenStoryline={onOpenStoryline}
    />
  );

  return (
    <SlideFrame
      id={DIRECTION_SECTION_ID}
      eyebrow="Are these policies coherent with each other?"
      headline={verdict.headline}
      body={synthesis}
      evidence={
        corpusThemes && corpusThemes.storylines.length > 0 ? (
          <RecurringPatternsBlock
            storylines={corpusThemes.storylines}
            countryConfig={countryConfig}
            totalAvailableDocs={documentCount}
            onOpenStoryline={onOpenStoryline}
          />
        ) : null
      }
      disclosure={
        <PrimerDisclosure
          primer={primer}
          countryConfig={countryConfig}
          onOpenPair={onOpenPair}
          onHighlightPair={onHighlightPair}
        />
      }
    />
  );
}

function pickStorylinePreview(storylines: CorpusStoryline[]): {
  reinforce: CorpusStoryline | null;
  friction: CorpusStoryline | null;
} {
  if (storylines.length === 0) {
    return { reinforce: null, friction: null };
  }
  const sortByConfidenceThenPairs = (a: CorpusStoryline, b: CorpusStoryline) => {
    const dC =
      (CONFIDENCE_RANK[a.confidence] ?? 3) -
      (CONFIDENCE_RANK[b.confidence] ?? 3);
    if (dC !== 0) return dC;
    return b.pair_count - a.pair_count;
  };
  const reinforce = storylines
    .filter((s) => s.type === "reinforcement")
    .sort(sortByConfidenceThenPairs)[0];
  const friction = storylines
    .filter((s) => s.type === "friction")
    .sort(sortByConfidenceThenPairs)[0];
  return {
    reinforce: reinforce ?? null,
    friction: friction ?? null,
  };
}

/**
 * The single on-page home for themes: every corpus storyline as a clickable
 * card (reinforcing first, then flagged), so the recurring patterns are
 * visible rather than hidden one link away. Clicking a card opens that
 * theme's drawer; the "browse all" link opens the same set with full
 * descriptions. The Doc-in-Focus slide no longer re-lists these.
 */
function RecurringPatternsBlock({
  storylines,
  countryConfig,
  totalAvailableDocs,
  onOpenStoryline,
}: {
  storylines: CorpusStoryline[];
  countryConfig: CountryConfig | null;
  totalAvailableDocs: number;
  onOpenStoryline: (s: CorpusStoryline) => void;
}) {
  const sortByConfidenceThenPairs = (a: CorpusStoryline, b: CorpusStoryline) => {
    const dC =
      (CONFIDENCE_RANK[a.confidence] ?? 3) -
      (CONFIDENCE_RANK[b.confidence] ?? 3);
    if (dC !== 0) return dC;
    return b.pair_count - a.pair_count;
  };
  const ordered = [
    ...storylines
      .filter((s) => s.type === "reinforcement")
      .sort(sortByConfidenceThenPairs),
    ...storylines
      .filter((s) => s.type === "friction")
      .sort(sortByConfidenceThenPairs),
  ];
  return (
    <div className="space-y-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--undp-gray)]">
        Recurring patterns{" "}
        <span className="tabular-nums">
          ({storylines.length.toLocaleString()})
        </span>
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {ordered.map((s) => (
          <li key={`${s.type}-${s.name}`}>
            <StorylineCard
              storyline={s}
              countryConfig={countryConfig}
              totalAvailableDocs={totalAvailableDocs}
              onOpen={() => onOpenStoryline(s)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function focusClause(c: TargetConcentration): string | null {
  if (c.totalFlaggedPairs === 0 || c.contestedTargetCount === 0) return null;
  const concentrated =
    c.topCount <= Math.max(1, Math.round(c.contestedTargetCount * 0.2));
  const sharePct = Math.round(c.coveredPairShare * 100);
  return concentrated
    ? `most of them (${sharePct}%) trace to just ${c.topCount} target${c.topCount === 1 ? "" : "s"}`
    : `they spread across ${c.contestedTargetCount} targets`;
}

function SynthesisSentence({
  countryName,
  documentCount,
  verdict,
  concentration,
  reinforce,
  friction,
  onOpenStoryline,
}: {
  countryName: string;
  documentCount: number;
  verdict: HeadlineVerdict;
  concentration: TargetConcentration;
  reinforce: CorpusStoryline | null;
  friction: CorpusStoryline | null;
  onOpenStoryline: (s: CorpusStoryline) => void;
}) {
  const focusText = focusClause(concentration);
  const docPhrase =
    documentCount === 1
      ? "1 document"
      : `${documentCount.toLocaleString()} documents`;
  const denom = verdict.alignmentPairs + verdict.tensionPairs;
  const reinforcePct =
    denom > 0 ? Math.round((verdict.alignmentPairs / denom) * 100) : 0;
  return (
    <>
      Across {docPhrase} from {countryName},{" "}
      <span className="tabular-nums">{verdict.signalPairs.toLocaleString()}</span>{" "}
      target pairs were scored.{" "}
      <span className="text-[var(--undp-black)] font-medium tabular-nums">
        {reinforcePct}%
      </span>{" "}
      reach medium or strong alignment
      {reinforce && (
        <>
          , anchored by{" "}
          <InlineStorylineLink
            storyline={reinforce}
            onOpen={() => onOpenStoryline(reinforce)}
          />
          {" "}
          (<span className="tabular-nums">
            {reinforce.pair_count.toLocaleString()}
          </span>
          {" "}pairs)
        </>
      )}
      .{" "}
      <span className="tabular-nums">
        {verdict.tensionPairs.toLocaleString()}
      </span>{" "}
      pair{verdict.tensionPairs === 1 ? "" : "s"} flagged for review
      {friction && (
        <>
          , most prominently around{" "}
          <InlineStorylineLink
            storyline={friction}
            onOpen={() => onOpenStoryline(friction)}
          />
          {" "}
          (<span className="tabular-nums">
            {friction.pair_count.toLocaleString()}
          </span>
          {" "}pairs)
        </>
      )}
      {focusText && <>; {focusText}</>}
      .
    </>
  );
}

function InlineStorylineLink({
  storyline,
  onOpen,
}: {
  storyline: CorpusStoryline;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-[var(--undp-black)] underline underline-offset-2 decoration-1 hover:decoration-2 italic"
      title={`Open the “${storyline.name}” theme`}
    >
      {storyline.name}
    </button>
  );
}

function PrimerDisclosure({
  primer,
  countryConfig,
  onOpenPair,
  onHighlightPair,
}: {
  primer: PrimerExamples;
  countryConfig: CountryConfig | null;
  onOpenPair: (line: FaultLine) => void;
  onHighlightPair?: (pair: PrimerHighlightPair | null) => void;
}) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const stored = localStorage.getItem(PRIMER_STORAGE_KEY);
      if (stored === "0") return false;
      return true;
    } catch {
      return true;
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
  const id = `${DIRECTION_SECTION_ID}-primer`;
  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--undp-gray)] hover:text-[var(--undp-black)] transition-colors"
        aria-expanded={!collapsed}
        aria-controls={id}
      >
        <span aria-hidden="true" className="text-[10px]">
          {collapsed ? "▸" : "▾"}
        </span>
        How the pipeline built this view
      </button>
      {!collapsed && (
        <div id={id} className="mt-3 space-y-3">
          <p className="text-[12px] leading-relaxed text-[var(--undp-gray)] max-w-prose">
            One scored pair from each end of the spectrum.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
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
                Not enough scored pairs to show an underlying example.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
