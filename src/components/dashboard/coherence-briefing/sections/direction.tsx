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
 * SlideFrame body.
 *
 * Per the theme-synthesis rework (July 2026, iterated on stakeholder
 * feedback): themes render as two side-by-side columns — top coherent
 * themes left, top potentially misaligned themes right — of compact
 * boxes (name, clamped description, live count worded to say what it
 * counts), capped at three per column with an inline expander, so the
 * reader gets the contrast and prioritization instead of 5-7 equal
 * text blocks. The synthesis sentence no longer embeds the leading
 * theme names (the boxes directly below carry them). Hovering a box
 * fades the adjacent wheel to that theme's documents and its
 * polarity's ribbons, behind a short hover-intent delay. Every count
 * shown here is live-computed from the visible alignment
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
import { TourButton } from "../tour/tour-button";
import {
  ALIGNED_COLOR,
  ALIGNMENT_COLORS,
  FLAGGED_COLOR,
  getDocFullLabel,
} from "@/lib/utils";
import {
  computeStorylineLiveStats,
  concentrationDocAttribution,
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
const ALIGNED_HEADER_COLOR = ALIGNED_COLOR;
const FRICTION_HEADER_COLOR = FLAGGED_COLOR;

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
  // Themes with no live pairs under the current selection drop out.
  const visibleStorylines = useMemo(
    () => storylines.filter((s) => (liveStats.get(s)?.liveCount ?? 0) > 0),
    [storylines, liveStats],
  );
  const hiddenThemeCount = storylines.length - visibleStorylines.length;

  const synthesis = (
    <SynthesisSentence
      countryName={countryName}
      documentCount={documentCount}
      verdict={verdict}
      concentration={concentration}
      primer={primer}
      countryConfig={countryConfig}
      onOpenPair={onOpenPair}
      onHighlightPair={onHighlightPair}
    />
  );

  return (
    <SlideFrame
      id={DIRECTION_SECTION_ID}
      headline={t(`verdict.${verdict.bucket}`)}
      body={synthesis}
      tourButton={
        corpusThemes && storylines.length > 0 ? (
          <TourButton tourId="directionThemes" scopeId={DIRECTION_SECTION_ID} />
        ) : undefined
      }
      evidence={
        corpusThemes && storylines.length > 0 ? (
          <RecurringThemesBlock
            visibleStorylines={visibleStorylines}
            hiddenThemeCount={hiddenThemeCount}
            liveStats={liveStats}
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
 * right — each up to three fixed-height boxes ranked purely by live count
 * (the score each box displays), with a per-column "+N more" expander for
 * payloads that carry more themes (legacy 5-7-storyline data). Clicking a
 * box opens that theme's drawer; hovering fades the wheel to the theme's
 * documents.
 */
function RecurringThemesBlock({
  visibleStorylines,
  hiddenThemeCount,
  liveStats,
  onOpenStoryline,
  onSpotlightTheme,
}: {
  visibleStorylines: CorpusStoryline[];
  hiddenThemeCount: number;
  liveStats: Map<CorpusStoryline, StorylineLiveStats>;
  onOpenStoryline: (s: CorpusStoryline) => void;
  onSpotlightTheme?: (spotlight: ThemeSpotlight | null) => void;
}) {
  const t = useTranslations("briefing.direction");
  // Boxes are ranked purely by live count, descending: the count is rendered
  // as the visible score in each box, so the order and the number agree.
  const liveCountOf = (s: CorpusStoryline) => liveStats.get(s)?.liveCount ?? 0;
  const byCount = (type: CorpusStoryline["type"]) =>
    visibleStorylines
      .filter((s) => s.type === type)
      .sort(
        (a, b) =>
          liveCountOf(b) - liveCountOf(a) || a.name.localeCompare(b.name),
      );
  const aligns = byCount("reinforcement");
  const review = byCount("friction");
  return (
    <div className="space-y-4">
      <div
        className="grid gap-x-8 gap-y-6 sm:grid-cols-2"
        data-tour="themes-columns"
      >
        <ThemeColumn
          tone="aligns"
          storylines={aligns}
          liveStats={liveStats}
          onOpenStoryline={onOpenStoryline}
          onSpotlightTheme={onSpotlightTheme}
        />
        <ThemeColumn
          tone="review"
          storylines={review}
          liveStats={liveStats}
          onOpenStoryline={onOpenStoryline}
          onSpotlightTheme={onSpotlightTheme}
        />
      </div>
      {hiddenThemeCount > 0 && (
        <p className="text-caption text-[var(--undp-gray)]">
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
  onOpenStoryline,
  onSpotlightTheme,
}: {
  tone: "aligns" | "review";
  storylines: CorpusStoryline[];
  liveStats: Map<CorpusStoryline, StorylineLiveStats>;
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
  const maxCount = storylines.reduce(
    (max, s) => Math.max(max, liveStats.get(s)?.liveCount ?? 0),
    0,
  );
  return (
    <div>
      <p
        className="mb-3 inline-flex items-center gap-2 text-data font-semibold"
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
        <p className="text-caption text-[var(--undp-gray)]">
          {t(isAligns ? "groups.emptyAligns" : "groups.emptyReview")}
        </p>
      ) : (
        <>
          <ul className="space-y-2.5">
            {visible.map((s) => (
              <li key={`${s.type}-${s.name}`}>
                <ThemeBox
                  storyline={s}
                  stats={
                    liveStats.get(s) ?? { liveCount: 0, docCounts: new Map() }
                  }
                  maxCount={maxCount}
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
              className="mt-1.5 text-caption text-[var(--undp-gray)] hover:text-[var(--undp-black)] underline"
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
  primer,
  countryConfig,
  onOpenPair,
  onHighlightPair,
}: {
  countryName: string;
  documentCount: number;
  verdict: HeadlineVerdict;
  concentration: TargetConcentration;
  primer: PrimerExamples;
  countryConfig: CountryConfig | null;
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
            <p className="text-caption leading-relaxed text-[var(--undp-gray)] mb-3">
              {definition}
            </p>
            <PrimerCardBody
              kind={kind}
              line={example}
              countryConfig={countryConfig}
            />
            <p className="mt-3 text-caption text-[var(--undp-gray)]">
              {t("clickToOpenPair")}
            </p>
          </div>,
          document.body,
        )}
    </span>
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
        className="flex items-center gap-2 text-caption text-[var(--undp-gray)] hover:text-[var(--undp-black)] transition-colors"
        aria-expanded={!collapsed}
        aria-controls={id}
      >
        <svg
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
          className={`h-2.5 w-2.5 transition-transform duration-200 ${collapsed ? "" : "rotate-90"}`}
        >
          <path
            d="M4.5 2.5 8 6l-3.5 3.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {t("howPipelineBuilt")}
      </button>
      {!collapsed && (
        <div id={id} className="mt-3 space-y-3">
          <p className="text-caption leading-relaxed text-[var(--undp-gray)] max-w-prose">
            {t("derivationNote")}
          </p>
          <p className="text-caption leading-relaxed text-[var(--undp-gray)] max-w-prose">
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
              <p className="text-caption text-[var(--undp-gray)] sm:col-span-2">
                {t("notEnoughPairs")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
