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

import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SlideFrame } from "../slide-frame";
import {
  PrimerCard,
  PrimerCardBody,
  type PrimerHighlightPair,
} from "../primer-card";
import { StorylineCard } from "../storyline-card";
import { ALIGNMENT_COLORS } from "@/lib/utils";
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
      primer={primer}
      countryConfig={countryConfig}
      onOpenStoryline={onOpenStoryline}
      onOpenPair={onOpenPair}
      onHighlightPair={onHighlightPair}
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

const STRONG_ALIGNMENT_DEFINITION =
  "Two targets that pull in the same direction: one supports or advances the other. A real scored pair from this set:";
const POTENTIAL_MISALIGNMENT_DEFINITION =
  "Two targets the AI identified as possibly working against each other: a prompt for human review, not a settled finding. A real scored pair:";

function SynthesisSentence({
  countryName,
  documentCount,
  verdict,
  concentration,
  reinforce,
  friction,
  primer,
  countryConfig,
  onOpenStoryline,
  onOpenPair,
  onHighlightPair,
}: {
  countryName: string;
  documentCount: number;
  verdict: HeadlineVerdict;
  concentration: TargetConcentration;
  reinforce: CorpusStoryline | null;
  friction: CorpusStoryline | null;
  primer: PrimerExamples;
  countryConfig: CountryConfig | null;
  onOpenStoryline: (s: CorpusStoryline) => void;
  onOpenPair: (line: FaultLine) => void;
  onHighlightPair?: (pair: PrimerHighlightPair | null) => void;
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
      reach{" "}
      <AlignmentTermPopover
        kind="aligned"
        example={primer.aligned}
        definition={STRONG_ALIGNMENT_DEFINITION}
        countryConfig={countryConfig}
        onOpenPair={onOpenPair}
        onHighlightPair={onHighlightPair}
      >
        strong alignment
      </AlignmentTermPopover>
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
      pair{verdict.tensionPairs === 1 ? "" : "s"} show{" "}
      <AlignmentTermPopover
        kind="flagged"
        example={primer.tension}
        definition={POTENTIAL_MISALIGNMENT_DEFINITION}
        countryConfig={countryConfig}
        onOpenPair={onOpenPair}
        onHighlightPair={onHighlightPair}
      >
        potential misalignment
      </AlignmentTermPopover>
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

/**
 * Inline term in the synthesis sentence that, on hover/focus, reveals a real
 * example of what the term means (reusing the Direction-section primer tiles).
 * Clicking opens the full pair. Rendered through a portal because the popover's
 * card markup can't legally nest inside the sentence <p> or a <button>. Falls
 * back to plain text when no example pair is available.
 */
function AlignmentTermPopover({
  children,
  kind,
  example,
  definition,
  countryConfig,
  onOpenPair,
  onHighlightPair,
}: {
  children: ReactNode;
  kind: "aligned" | "flagged";
  example: FaultLine | null;
  definition: string;
  countryConfig: CountryConfig | null;
  onOpenPair: (line: FaultLine) => void;
  onHighlightPair?: (pair: PrimerHighlightPair | null) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const color =
    kind === "aligned" ? ALIGNMENT_COLORS.high : ALIGNMENT_COLORS.flagged;

  if (!example) {
    return (
      <span className="font-medium text-[var(--undp-black)]">{children}</span>
    );
  }

  const pair: PrimerHighlightPair = {
    aId: example.targetA.id,
    bId: example.targetB.id,
  };
  const show = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
    const left = Math.min(Math.max(r.left + r.width / 2, 168), vw - 168);
    setCoords({ top: r.bottom + 8, left });
    onHighlightPair?.(pair);
  };
  const hide = () => {
    setCoords(null);
    onHighlightPair?.(null);
  };

  return (
    <span onMouseEnter={show} onMouseLeave={hide}>
      <button
        ref={ref}
        type="button"
        onClick={() => onOpenPair(example)}
        onFocus={show}
        onBlur={hide}
        onKeyDown={(e) => {
          if (e.key === "Escape") hide();
        }}
        aria-label={`Show an example of ${
          kind === "aligned" ? "strong alignment" : "potential misalignment"
        }`}
        className="font-medium text-[var(--undp-black)] underline decoration-dotted decoration-1 underline-offset-2 hover:decoration-2 focus:outline-none focus:decoration-2"
        style={{ textDecorationColor: color }}
      >
        {children}
      </button>
      {coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            className="fixed z-50 w-[320px] -translate-x-1/2 rounded-md border border-gray-200 bg-white p-4 shadow-xl"
            style={{ top: coords.top, left: coords.left, pointerEvents: "none" }}
          >
            <p className="text-[11px] leading-relaxed text-[var(--undp-gray)] mb-3">
              {definition}
            </p>
            <PrimerCardBody
              kind={kind}
              line={example}
              countryConfig={countryConfig}
            />
            <p className="mt-3 text-[10px] uppercase tracking-wider text-[var(--undp-gray)]">
              Click the term to open this pair
            </p>
          </div>,
          document.body,
        )}
    </span>
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
