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
 * SlideFrame body, with the two leading theme names embedded as
 * inline-clickable buttons.
 *
 * Per the theme-synthesis rework (July 2026, iterated on first
 * feedback): themes render as two side-by-side columns — top coherent
 * themes left, top potentially misaligned themes right — of compact
 * boxes (name, document-composition strip in wheel-matching colors,
 * live count), capped at three per column with an inline expander, so
 * the reader gets the contrast and prioritization instead of 5-7
 * equal text blocks. Hovering a box fades the adjacent wheel to that
 * theme's documents and its polarity's ribbons. Every count shown
 * here is live-computed from the visible alignment
 * (computeStorylineLiveStats); the persisted pair_count is never
 * displayed. Themes with no live pairs under the current document
 * selection drop out with a quiet note.
 *
 * Numbers in the body are deterministic from the alignment data; the
 * theme names are LLM-derived (`corpus_themes.json`) and refresh when
 * the synthesis pipeline re-runs. PrimerDisclosure stays for reviewers
 * who want to see one underlying scored pair from each polarity.
 */

import { useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { SlideFrame } from "../slide-frame";
import {
  PrimerCard,
  PrimerCardBody,
  type PrimerHighlightPair,
} from "../primer-card";
import { ThemeBox, type ThemeSpotlight } from "../storyline-card";
import { ALIGNMENT_COLORS, getDocFullLabel } from "@/lib/utils";
import {
  computeStorylineLiveStats,
  concentrationDocAttribution,
  rankStorylines,
  type FaultLine,
  type HeadlineVerdict,
  type PrimerExamples,
  type StorylineLiveStats,
  type TargetConcentration,
} from "@/lib/coherence-briefing";
import type {
  AlignmentResult,
  CorpusStoryline,
  CorpusThemes,
  CountryConfig,
  Target,
} from "@/types";

export const DIRECTION_SECTION_ID = "direction";

const PRIMER_STORAGE_KEY = "cpc.briefing.primer-collapsed";
const BOXES_PER_COLUMN = 3;
const ALIGNED_HEADER_COLOR = "#196127";
const FRICTION_HEADER_COLOR = "#dc2626";

export function DirectionSection({
  countryName,
  documentCount,
  verdict,
  concentration,
  primer,
  countryConfig,
  corpusThemes,
  alignment,
  targets,
  onOpenStoryline,
  onOpenPair,
  onHighlightPair,
  onSpotlightTheme,
}: {
  countryName: string;
  documentCount: number;
  verdict: HeadlineVerdict;
  concentration: TargetConcentration;
  primer: PrimerExamples;
  countryConfig: CountryConfig | null;
  corpusThemes: CorpusThemes | null;
  /** Visible (document-filtered) alignment; drives every live theme count. */
  alignment: AlignmentResult[];
  /** Visible (document-filtered) targets. */
  targets: Target[];
  onOpenStoryline: (s: CorpusStoryline) => void;
  onOpenPair: (line: FaultLine) => void;
  onHighlightPair?: (pair: PrimerHighlightPair | null) => void;
  /** Hovering a theme box fades the wheel to that theme's documents. */
  onSpotlightTheme?: (spotlight: ThemeSpotlight | null) => void;
}) {
  const t = useTranslations("briefing.direction");
  const storylines = useMemo(
    () => corpusThemes?.storylines ?? [],
    [corpusThemes],
  );
  const liveStats = useMemo(
    () => computeStorylineLiveStats(storylines, alignment, targets),
    [storylines, alignment, targets],
  );
  const liveCountOf = (s: CorpusStoryline) => liveStats.get(s)?.liveCount ?? 0;
  // Themes with no live pairs under the current selection drop out.
  const visibleStorylines = useMemo(
    () => storylines.filter((s) => (liveStats.get(s)?.liveCount ?? 0) > 0),
    [storylines, liveStats],
  );
  const hiddenThemeCount = storylines.length - visibleStorylines.length;

  const previewReinforce =
    rankStorylines(visibleStorylines, "reinforcement", liveCountOf)[0] ?? null;
  const previewFriction =
    rankStorylines(visibleStorylines, "friction", liveCountOf)[0] ?? null;

  const synthesis = (
    <SynthesisSentence
      countryName={countryName}
      documentCount={documentCount}
      verdict={verdict}
      concentration={concentration}
      reinforce={previewReinforce}
      friction={previewFriction}
      liveCountOf={liveCountOf}
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
      eyebrow={t("eyebrow")}
      headline={t(`verdict.${verdict.bucket}`)}
      body={synthesis}
      evidence={
        corpusThemes && storylines.length > 0 ? (
          <RecurringThemesBlock
            visibleStorylines={visibleStorylines}
            hiddenThemeCount={hiddenThemeCount}
            liveStats={liveStats}
            countryConfig={countryConfig}
            onOpenStoryline={onOpenStoryline}
            onSpotlightTheme={onSpotlightTheme}
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

/**
 * The single on-page home for themes: two side-by-side columns — the top
 * coherent themes on the left, the top potentially misaligned themes on the
 * right — each up to three boxes ranked by confidence then live count, with
 * a per-column "+N more" expander for payloads that carry more themes
 * (legacy 5-7-storyline data). Clicking a box opens that theme's drawer;
 * hovering fades the wheel to the theme's documents.
 */
function RecurringThemesBlock({
  visibleStorylines,
  hiddenThemeCount,
  liveStats,
  countryConfig,
  onOpenStoryline,
  onSpotlightTheme,
}: {
  visibleStorylines: CorpusStoryline[];
  hiddenThemeCount: number;
  liveStats: Map<CorpusStoryline, StorylineLiveStats>;
  countryConfig: CountryConfig | null;
  onOpenStoryline: (s: CorpusStoryline) => void;
  onSpotlightTheme?: (spotlight: ThemeSpotlight | null) => void;
}) {
  const t = useTranslations("briefing.direction");
  const liveCountOf = (s: CorpusStoryline) => liveStats.get(s)?.liveCount ?? 0;
  const aligns = rankStorylines(visibleStorylines, "reinforcement", liveCountOf);
  const review = rankStorylines(visibleStorylines, "friction", liveCountOf);
  return (
    <div className="space-y-3">
      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
        <ThemeColumn
          tone="aligns"
          storylines={aligns}
          liveStats={liveStats}
          countryConfig={countryConfig}
          onOpenStoryline={onOpenStoryline}
          onSpotlightTheme={onSpotlightTheme}
        />
        <ThemeColumn
          tone="review"
          storylines={review}
          liveStats={liveStats}
          countryConfig={countryConfig}
          onOpenStoryline={onOpenStoryline}
          onSpotlightTheme={onSpotlightTheme}
        />
      </div>
      {hiddenThemeCount > 0 && (
        <p className="text-[10.5px] italic text-[var(--undp-gray)]">
          {t("groups.hiddenForSelection", { count: hiddenThemeCount })}
        </p>
      )}
    </div>
  );
}

function ThemeColumn({
  tone,
  storylines,
  liveStats,
  countryConfig,
  onOpenStoryline,
  onSpotlightTheme,
}: {
  tone: "aligns" | "review";
  storylines: CorpusStoryline[];
  liveStats: Map<CorpusStoryline, StorylineLiveStats>;
  countryConfig: CountryConfig | null;
  onOpenStoryline: (s: CorpusStoryline) => void;
  onSpotlightTheme?: (spotlight: ThemeSpotlight | null) => void;
}) {
  const t = useTranslations("briefing.direction");
  const [expanded, setExpanded] = useState(false);
  const isAligns = tone === "aligns";
  const headerColor = isAligns ? ALIGNED_HEADER_COLOR : FRICTION_HEADER_COLOR;
  const visible = expanded
    ? storylines
    : storylines.slice(0, BOXES_PER_COLUMN);
  const overflow = storylines.length - BOXES_PER_COLUMN;
  return (
    <div>
      <p
        className="mb-2 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-semibold"
        style={{ color: headerColor }}
      >
        <span
          aria-hidden="true"
          className="block h-2 w-2 rounded-full"
          style={
            isAligns
              ? { backgroundColor: headerColor }
              : { boxShadow: `inset 0 0 0 1px ${headerColor}` }
          }
        />
        {t(isAligns ? "groups.alignsTop" : "groups.reviewTop", {
          count: Math.min(BOXES_PER_COLUMN, storylines.length),
        })}
      </p>
      {storylines.length === 0 ? (
        <p className="text-[11.5px] italic text-[var(--undp-gray)]">
          {t(isAligns ? "groups.emptyAligns" : "groups.emptyReview")}
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {visible.map((s) => (
              <li key={`${s.type}-${s.name}`}>
                <ThemeBox
                  storyline={s}
                  stats={
                    liveStats.get(s) ?? { liveCount: 0, docCounts: new Map() }
                  }
                  countryConfig={countryConfig}
                  onOpen={() => onOpenStoryline(s)}
                  onSpotlight={onSpotlightTheme}
                />
              </li>
            ))}
          </ul>
          {overflow > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1.5 text-[11px] text-[var(--undp-gray)] hover:text-[var(--undp-black)] underline"
            >
              {expanded
                ? t("groups.showFewer")
                : t("groups.showMore", { count: overflow })}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function focusClause(
  c: TargetConcentration,
  countryConfig: CountryConfig | null,
  t: ReturnType<typeof useTranslations<"briefing.direction">>,
): string | null {
  if (c.totalFlaggedPairs === 0 || c.contestedTargetCount === 0) return null;
  const concentrated =
    c.topCount <= Math.max(1, Math.round(c.contestedTargetCount * 0.2));
  const sharePct = Math.round(c.coveredPairShare * 100);
  if (!concentrated) {
    return t("focusSpread", { count: c.contestedTargetCount });
  }
  // When one document dominates the concentration set, name it (documents
  // only, never ministries).
  const attribution = concentrationDocAttribution(c);
  if (attribution) {
    return t("focusConcentratedWithDoc", {
      pct: sharePct,
      count: c.topCount,
      docCount: attribution.count,
      docName: getDocFullLabel(countryConfig, attribution.doc),
    });
  }
  return t("focusConcentrated", { pct: sharePct, count: c.topCount });
}

// Definitions surface in the AlignmentTermPopover; consumer reads them from
// translations via the `t` instance passed in.

function SynthesisSentence({
  countryName,
  documentCount,
  verdict,
  concentration,
  reinforce,
  friction,
  liveCountOf,
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
  liveCountOf: (s: CorpusStoryline) => number;
  primer: PrimerExamples;
  countryConfig: CountryConfig | null;
  onOpenStoryline: (s: CorpusStoryline) => void;
  onOpenPair: (line: FaultLine) => void;
  onHighlightPair?: (pair: PrimerHighlightPair | null) => void;
}) {
  const t = useTranslations("briefing.direction");
  const focusText = focusClause(concentration, countryConfig, t);
  const docPhrase = t("docPhrase", { count: documentCount });
  const denom = verdict.alignmentPairs + verdict.tensionPairs;
  const reinforcePct =
    denom > 0 ? Math.round((verdict.alignmentPairs / denom) * 100) : 0;
  return (
    <>
      {t("openingPrefix", { docPhrase, country: countryName })}{" "}
      <span className="tabular-nums">{verdict.signalPairs.toLocaleString()}</span>{" "}
      {t("scoredSuffix")}{" "}
      <span className="text-[var(--undp-black)] font-medium tabular-nums">
        {reinforcePct}%
      </span>{" "}
      {t("reach")}{" "}
      <AlignmentTermPopover
        kind="aligned"
        example={primer.aligned}
        definition={t("alignedDefinition")}
        countryConfig={countryConfig}
        onOpenPair={onOpenPair}
        onHighlightPair={onHighlightPair}
      >
        {t("strongAlignment")}
      </AlignmentTermPopover>
      {reinforce && (
        <>
          {t("anchoredBy")}{" "}
          <InlineStorylineLink
            storyline={reinforce}
            onOpen={() => onOpenStoryline(reinforce)}
          />
          {" "}
          (<span className="tabular-nums">
            {liveCountOf(reinforce).toLocaleString()}
          </span>
          {" "}{t("pairsParen")})
        </>
      )}
      .{" "}
      <span className="tabular-nums">
        {verdict.tensionPairs.toLocaleString()}
      </span>{" "}
      {t("pairsShow", { count: verdict.tensionPairs })}{" "}
      <AlignmentTermPopover
        kind="flagged"
        example={primer.tension}
        definition={t("flaggedDefinition")}
        countryConfig={countryConfig}
        onOpenPair={onOpenPair}
        onHighlightPair={onHighlightPair}
      >
        {t("potentialMisalignment")}
      </AlignmentTermPopover>
      {friction && (
        <>
          {t("mostProminentlyAround")}{" "}
          <InlineStorylineLink
            storyline={friction}
            onOpen={() => onOpenStoryline(friction)}
          />
          {" "}
          (<span className="tabular-nums">
            {liveCountOf(friction).toLocaleString()}
          </span>
          {" "}{t("pairsParen")})
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
  const t = useTranslations("briefing.direction");
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
        aria-label={t("popoverAriaLabel", {
          term:
            kind === "aligned"
              ? t("strongAlignment")
              : t("potentialMisalignment"),
        })}
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
              {t("clickToOpenPair")}
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
  const t = useTranslations("briefing.direction");
  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-[var(--undp-black)] underline underline-offset-2 decoration-1 hover:decoration-2 italic"
      title={t("storylineOpenTitle", { name: storyline.name })}
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
  const t = useTranslations("briefing.direction");
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
        {t("howPipelineBuilt")}
      </button>
      {!collapsed && (
        <div id={id} className="mt-3 space-y-3">
          <p className="text-[12px] leading-relaxed text-[var(--undp-gray)] max-w-prose">
            {t("derivationNote")}
          </p>
          <p className="text-[12px] leading-relaxed text-[var(--undp-gray)] max-w-prose">
            {t("onePairFromEnd")}
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
                {t("notEnoughPairs")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
