"use client";

/**
 * Relationships section — merged Section 1 of the findings home.
 *
 * Round-2 merge: this section now answers the user's actual framing
 * question ("are these policies pulling the same direction?") and absorbs
 * what used to be a separate Direction section above the wheel. Layout,
 * top to bottom:
 *
 *   1. Eyebrow + verdict headline + verdict sentence + verdict badge
 *      (was the Direction section).
 *   2. Corpus summary paragraph (3-4 sentences) from corpus_themes.json.
 *   3. Theme chips — reinforce + friction storylines.
 *   4. Doc-pair ranking — synthesised storyline per cross-doc pair from
 *      doc_pair_synthesis.json, with balance bar and an inline clash/
 *      reinforce excerpt under the storyline name.
 *   5. "How to read this view" disclosure — the primer pair (aligned +
 *      flagged examples) tucked behind a closed-by-default disclosure
 *      at the bottom.
 *
 * If the synthesis JSONs are absent (older runs), falls back to the legacy
 * fault-line list with the same verdict header + primer block.
 *
 * The exported section id constant stays "misalignments" so jump-nav +
 * deep-links keep working through the round-2 rename.
 */

import { useState } from "react";
import { PrimerCard, type PrimerHighlightPair } from "../primer-card";
import {
  computeDocPairBalance,
  getDocPairKey,
  getStorylineDocPairKeys,
  type AnchorHeadline,
  type DocPairDisagreement,
  type FaultLine,
  type HeadlineVerdict,
  type PrimerExamples,
  type VerdictBucket,
} from "@/lib/coherence-briefing";
import {
  ALIGNMENT_COLORS,
  ALIGNMENT_LABELS,
  getDocMediumLabel,
} from "@/lib/utils";
import { isContradiction } from "@/types";
import type {
  CorpusStoryline,
  CorpusThemes,
  CountryConfig,
  DocPairSynthesis,
} from "@/types";

export const MISALIGNMENTS_SECTION_ID = "misalignments";

const HEADLINE_SERIF =
  "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif";
const ALIGNED_DOT_COLOR = "#196127";
const FRICTION_DOT_COLOR = "#dc2626";
const AI_DISCLAIMER =
  "AI-generated synthesis. Treat as a prompt to review, not a settled finding.";
const PRIMER_STORAGE_KEY = "cpc.briefing.primer-collapsed";
const CLASH_EXCERPT_RATIO = 0.25;

export type ThemeTypeFilter = "all" | "reinforcement" | "friction";

export function RelationshipsSection({
  countryName,
  documentCount,
  anchor,
  verdict,
  primer,
  faultLines,
  docPairDisagreements,
  docPairSyntheses,
  corpusThemes,
  countryConfig,
  onOpenPair,
  onOpenDocPair,
  selectedThemeNames,
  onToggleTheme,
  themeTypeFilter,
  onThemeTypeChange,
  onHoverDocPair,
  onHighlightPair,
}: {
  countryName: string;
  documentCount: number;
  anchor: AnchorHeadline;
  verdict: HeadlineVerdict;
  primer: PrimerExamples;
  faultLines: FaultLine[];
  docPairDisagreements: DocPairDisagreement[];
  docPairSyntheses: DocPairSynthesis[];
  corpusThemes: CorpusThemes | null;
  countryConfig: CountryConfig | null;
  onOpenPair: (line: FaultLine) => void;
  onOpenDocPair: (dp: DocPairSynthesis) => void;
  selectedThemeNames: string[];
  onToggleTheme: (name: string) => void;
  themeTypeFilter: ThemeTypeFilter;
  onThemeTypeChange: (f: ThemeTypeFilter) => void;
  onHoverDocPair?: (key: string | null) => void;
  onHighlightPair?: (pair: PrimerHighlightPair | null) => void;
}) {
  const hasSynthesis = corpusThemes !== null && docPairSyntheses.length > 0;

  const allowedDocPairKeys = (() => {
    if (!corpusThemes || selectedThemeNames.length === 0) return null;
    const selected = corpusThemes.storylines.filter((s) =>
      selectedThemeNames.includes(s.name),
    );
    if (selected.length === 0) return null;
    const out = new Set<string>();
    for (const s of selected) {
      for (const k of getStorylineDocPairKeys(s)) out.add(k);
    }
    return out;
  })();

  const visibleStorylines =
    corpusThemes?.storylines.filter((s) =>
      themeTypeFilter === "all" ? true : s.type === themeTypeFilter,
    ) ?? [];

  const visibleDocPairs = docPairSyntheses
    .filter((dp) => {
      if (!allowedDocPairKeys) return true;
      return allowedDocPairKeys.has(getDocPairKey(dp.doc_a, dp.doc_b));
    })
    .sort(
      (a, b) =>
        b.aligned_count + b.flagged_count - (a.aligned_count + a.flagged_count),
    );

  const maxTotal = visibleDocPairs.reduce(
    (m, dp) => Math.max(m, dp.aligned_count + dp.flagged_count),
    1,
  );

  const sentence = composeDirectionSentence({
    countryName,
    documentCount,
    anchor,
    verdict,
  });

  return (
    <section
      id={MISALIGNMENTS_SECTION_ID}
      className="scroll-mt-24 pt-2"
      aria-labelledby={`${MISALIGNMENTS_SECTION_ID}-heading`}
    >
      <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--undp-gray)] mb-2">
        Are these policies pulling the same direction?
      </p>
      <h2
        id={`${MISALIGNMENTS_SECTION_ID}-heading`}
        className="text-[28px] sm:text-[32px] leading-[1.15] text-[var(--undp-black)] font-medium mb-4"
        style={{ fontFamily: HEADLINE_SERIF }}
      >
        {sentence.headline}
      </h2>
      <p className="text-[15px] leading-relaxed text-[var(--undp-black)] max-w-prose mb-4">
        {sentence.body}
      </p>
      <div className="mb-8">
        <VerdictBadge bucket={verdict.bucket} />
      </div>

      {hasSynthesis ? (
        <>
          <CorpusSummary themes={corpusThemes} />
          <ThemesBlock
            storylines={visibleStorylines}
            allStorylines={corpusThemes.storylines}
            selectedThemeNames={selectedThemeNames}
            onToggleTheme={onToggleTheme}
            themeTypeFilter={themeTypeFilter}
            onThemeTypeChange={onThemeTypeChange}
          />
          <DocPairRanking
            docPairs={visibleDocPairs}
            maxTotal={maxTotal}
            countryConfig={countryConfig}
            onOpenDocPair={onOpenDocPair}
            onHoverDocPair={onHoverDocPair}
          />
        </>
      ) : (
        <LegacyFaultLineFallback
          faultLines={faultLines}
          docPairDisagreements={docPairDisagreements}
          countryConfig={countryConfig}
          onOpenPair={onOpenPair}
        />
      )}

      <PrimerDisclosure
        primer={primer}
        countryConfig={countryConfig}
        onOpenPair={onOpenPair}
        onHighlightPair={onHighlightPair}
      />
    </section>
  );
}

// ─── Verdict header (lifted from former direction.tsx) ─────────────

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
  const headline = verdict.headline;
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
      color: ALIGNMENT_COLORS.flagged,
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

// ─── Corpus summary ────────────────────────────────────────────────

function CorpusSummary({ themes }: { themes: CorpusThemes }) {
  return (
    <p className="text-[15px] leading-relaxed text-[var(--undp-black)] max-w-prose mb-8">
      {themes.summary_paragraph}
    </p>
  );
}

// ─── Theme chip block ──────────────────────────────────────────────

function ThemesBlock({
  storylines,
  allStorylines,
  selectedThemeNames,
  onToggleTheme,
  themeTypeFilter,
  onThemeTypeChange,
}: {
  storylines: CorpusStoryline[];
  allStorylines: CorpusStoryline[];
  selectedThemeNames: string[];
  onToggleTheme: (name: string) => void;
  themeTypeFilter: ThemeTypeFilter;
  onThemeTypeChange: (f: ThemeTypeFilter) => void;
}) {
  const counts = {
    all: allStorylines.length,
    reinforcement: allStorylines.filter((s) => s.type === "reinforcement")
      .length,
    friction: allStorylines.filter((s) => s.type === "friction").length,
  };
  return (
    <div className="mb-8">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--undp-gray)]">
          Themes
        </p>
        <ThemeTypeSegmented
          value={themeTypeFilter}
          onChange={onThemeTypeChange}
          counts={counts}
        />
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {storylines.map((s) => (
          <ThemeChip
            key={s.name}
            storyline={s}
            selected={selectedThemeNames.includes(s.name)}
            anySelected={selectedThemeNames.length > 0}
            onToggle={() => onToggleTheme(s.name)}
          />
        ))}
      </ul>
      <p className="mt-3 text-[10px] text-[var(--undp-gray)] leading-relaxed">
        {AI_DISCLAIMER}
      </p>
    </div>
  );
}

function ThemeTypeSegmented({
  value,
  onChange,
  counts,
}: {
  value: ThemeTypeFilter;
  onChange: (f: ThemeTypeFilter) => void;
  counts: { all: number; reinforcement: number; friction: number };
}) {
  const opts: Array<{ id: ThemeTypeFilter; label: string; count: number }> = [
    { id: "all", label: "All", count: counts.all },
    { id: "reinforcement", label: "Reinforce", count: counts.reinforcement },
    { id: "friction", label: "Flagged", count: counts.friction },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Theme type filter"
      className="inline-flex rounded-full border border-gray-300 bg-white p-0.5 text-[11px]"
    >
      {opts.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            className={`px-3 py-1 rounded-full transition-colors tabular-nums ${
              active
                ? "bg-[var(--undp-black)] text-white"
                : "text-[var(--undp-gray)] hover:text-[var(--undp-black)]"
            }`}
          >
            {o.label}
            <span className="ml-1 opacity-70">{o.count}</span>
          </button>
        );
      })}
    </div>
  );
}

function ThemeChip({
  storyline,
  selected,
  anySelected,
  onToggle,
}: {
  storyline: CorpusStoryline;
  selected: boolean;
  anySelected: boolean;
  onToggle: () => void;
}) {
  const isReinforce = storyline.type === "reinforcement";
  const dotColor = isReinforce ? ALIGNED_DOT_COLOR : FRICTION_DOT_COLOR;
  const ghosted = anySelected && !selected;
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        className={`w-full text-left rounded border px-3 py-2 transition-all ${
          selected
            ? "border-[var(--undp-black)] bg-[var(--undp-black)]/[0.04]"
            : "border-gray-200 hover:border-gray-400 bg-white"
        } ${ghosted ? "opacity-40" : ""}`}
      >
        <div className="flex items-start gap-2">
          <span
            aria-hidden="true"
            className="mt-1.5 block h-2 w-2 rounded-full shrink-0"
            style={
              isReinforce
                ? { backgroundColor: dotColor }
                : { boxShadow: `inset 0 0 0 1px ${dotColor}` }
            }
          />
          <div className="flex-1 min-w-0">
            <p
              className="text-[13px] text-[var(--undp-black)] leading-snug"
              style={{ fontFamily: HEADLINE_SERIF }}
            >
              {storyline.name}
            </p>
            <p className="mt-1 text-[10px] text-[var(--undp-gray)] tabular-nums">
              Recurs across {storyline.spans_documents.length} doc
              {storyline.spans_documents.length === 1 ? "" : "s"} ·{" "}
              {storyline.pair_count.toLocaleString()} pairs
            </p>
          </div>
        </div>
      </button>
    </li>
  );
}

// ─── Doc-pair ranking ──────────────────────────────────────────────

function DocPairRanking({
  docPairs,
  maxTotal,
  countryConfig,
  onOpenDocPair,
  onHoverDocPair,
}: {
  docPairs: DocPairSynthesis[];
  maxTotal: number;
  countryConfig: CountryConfig | null;
  onOpenDocPair: (dp: DocPairSynthesis) => void;
  onHoverDocPair?: (key: string | null) => void;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-3">
        Doc-pair ranking
      </p>
      {docPairs.length === 0 ? (
        <p className="text-sm italic text-[var(--undp-gray)]">
          No doc-pair synthesis matched the active filter. Clear the theme
          chips to see the full ranking.
        </p>
      ) : (
        <ol className="divide-y divide-gray-200 border-y border-gray-200">
          {docPairs.map((dp) => (
            <DocPairRow
              key={`${dp.doc_a}__${dp.doc_b}`}
              dp={dp}
              maxTotal={maxTotal}
              countryConfig={countryConfig}
              onOpen={() => onOpenDocPair(dp)}
              onHover={onHoverDocPair}
            />
          ))}
        </ol>
      )}
      <p className="mt-3 text-[10px] text-[var(--undp-gray)] leading-relaxed">
        {AI_DISCLAIMER}
      </p>
    </div>
  );
}

function DocPairRow({
  dp,
  maxTotal,
  countryConfig,
  onOpen,
  onHover,
}: {
  dp: DocPairSynthesis;
  maxTotal: number;
  countryConfig: CountryConfig | null;
  onOpen: () => void;
  onHover?: (key: string | null) => void;
}) {
  const labelA = getDocMediumLabel(countryConfig, dp.doc_a);
  const labelB = getDocMediumLabel(countryConfig, dp.doc_b);
  const balance = computeDocPairBalance(dp);
  const totalWidthPct = maxTotal > 0 ? (balance.total / maxTotal) * 100 : 0;
  const hoverKey = getDocPairKey(dp.doc_a, dp.doc_b);
  const failed = dp.synthesis_error !== null;
  // R4: pick the excerpt side based on whether friction is meaningfully
  // present. ratio threshold matches the plan: if flagged >= 25% of
  // aligned, show the clash; otherwise lead with reinforce.
  const showClash =
    !failed && dp.flagged_count > dp.aligned_count * CLASH_EXCERPT_RATIO;
  const excerptText = failed
    ? null
    : showClash
      ? dp.synthesis.clash
      : dp.synthesis.reinforce;
  const excerptPrefix = showClash ? "Flagged" : "Reinforces";
  const excerptColor = showClash
    ? ALIGNMENT_COLORS.flagged
    : ALIGNMENT_COLORS.high;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        onMouseEnter={() => onHover?.(hoverKey)}
        onMouseLeave={() => onHover?.(null)}
        onFocus={() => onHover?.(hoverKey)}
        onBlur={() => onHover?.(null)}
        className="w-full text-left py-3 hover:bg-gray-50 transition-colors px-1 rounded"
      >
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1.5">
          <div className="flex items-baseline gap-2 min-w-0">
            <span
              className="text-[13px] font-medium text-[var(--undp-black)] shrink-0"
              style={{ fontFamily: HEADLINE_SERIF }}
            >
              {labelA} ↔ {labelB}
            </span>
            <span
              className="text-[12px] text-[var(--undp-gray)] leading-snug truncate"
              style={{ fontFamily: HEADLINE_SERIF }}
            >
              {failed
                ? "Synthesis failed, open for raw pair list."
                : dp.synthesis.storyline_name}
            </span>
          </div>
        </div>
        {excerptText && (
          <p
            className="text-[11.5px] italic text-[var(--undp-gray)] leading-snug mb-2 max-w-prose overflow-hidden"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            <span
              className="not-italic font-semibold uppercase tracking-wider text-[9.5px] mr-1.5"
              style={{ color: excerptColor }}
            >
              {excerptPrefix} ·
            </span>
            {excerptText}
          </p>
        )}
        <div className="grid grid-cols-[1fr_auto] items-center gap-3">
          <div
            className="relative h-2.5 rounded-full overflow-hidden bg-gray-100"
            style={{ width: `${Math.max(totalWidthPct, 6)}%` }}
            aria-hidden="true"
          >
            <div
              className="absolute inset-y-0 left-0"
              style={{
                width: `${balance.alignedShare * 100}%`,
                backgroundColor: ALIGNMENT_COLORS.high,
                opacity: failed ? 0.4 : 0.9,
              }}
            />
            <div
              className="absolute inset-y-0"
              style={{
                left: `${balance.alignedShare * 100}%`,
                width: `${balance.flaggedShare * 100}%`,
                backgroundColor: ALIGNMENT_COLORS.flagged,
                opacity: failed ? 0.4 : 0.95,
              }}
            />
          </div>
          <p className="text-[12px] text-[var(--undp-black)] tabular-nums font-medium whitespace-nowrap">
            <span style={{ color: ALIGNMENT_COLORS.high }}>
              {dp.aligned_count.toLocaleString()} aligned
            </span>
            <span className="text-[var(--undp-gray)] mx-1">·</span>
            <span style={{ color: ALIGNMENT_COLORS.flagged }}>
              {dp.flagged_count.toLocaleString()} flagged
            </span>
          </p>
        </div>
      </button>
    </li>
  );
}

// ─── Primer disclosure ─────────────────────────────────────────────

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
  // Default closed (round 2 change). Persist user preference via the same
  // localStorage key the old direction.tsx used so existing users keep
  // their preference. Treat absent key as closed.
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
        // Ignore storage errors.
      }
      return next;
    });
  };
  const id = `${MISALIGNMENTS_SECTION_ID}-primer`;
  return (
    <div className="mt-8 border-t border-gray-200 pt-4">
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
        How to read this view
      </button>
      {!collapsed && (
        <div id={id} className="mt-3 grid gap-3 sm:grid-cols-2">
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
  );
}

// ─── Legacy fallback (no synthesis JSON present) ───────────────────

function LegacyFaultLineFallback({
  faultLines,
  docPairDisagreements,
  countryConfig,
  onOpenPair,
}: {
  faultLines: FaultLine[];
  docPairDisagreements: DocPairDisagreement[];
  countryConfig: CountryConfig | null;
  onOpenPair: (line: FaultLine) => void;
}) {
  const topDoc = docPairDisagreements[0];
  return (
    <>
      <p className="text-[15px] leading-relaxed text-[var(--undp-black)] max-w-prose mb-6">
        {topDoc
          ? `${topDoc.flaggedCount} of ${topDoc.totalScored} scored pairs between ${getDocMediumLabel(countryConfig, topDoc.docA)} and ${getDocMediumLabel(countryConfig, topDoc.docB)} are flagged for review, the highest cross-document share in the corpus.`
          : `${faultLines.length} pairs are flagged for review below. Synthesis layer not yet generated for this country.`}
      </p>
      {faultLines.length === 0 ? (
        <p className="text-sm italic text-[var(--undp-gray)]">
          No flagged pairs in this dataset.
        </p>
      ) : (
        <ol className="divide-y divide-gray-200 border-y border-gray-200">
          {faultLines.map((line, i) => (
            <FaultRow
              key={`${line.pair.targetAId}__${line.pair.targetBId}`}
              line={line}
              index={i}
              countryConfig={countryConfig}
              onSelect={() => onOpenPair(line)}
            />
          ))}
        </ol>
      )}
    </>
  );
}

function FaultRow({
  line,
  index,
  countryConfig,
  onSelect,
}: {
  line: FaultLine;
  index: number;
  countryConfig: CountryConfig | null;
  onSelect: () => void;
}) {
  const { targetA, targetB, pair } = line;
  const color = ALIGNMENT_COLORS[pair.alignment];
  const isContra = isContradiction(pair.alignment);
  const docA = getDocMediumLabel(countryConfig, targetA.sourceDocument);
  const docB = getDocMediumLabel(countryConfig, targetB.sourceDocument);
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="w-full text-left py-3 grid grid-cols-[1.75rem_1fr] gap-3 items-start hover:bg-gray-50 transition-colors px-1 rounded"
      >
        <span
          className="text-xs text-[var(--undp-gray)] tabular-nums pt-0.5"
          aria-hidden="true"
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: `${color}20`,
                color,
                border: `1px solid ${color}40`,
              }}
            >
              {ALIGNMENT_LABELS[pair.alignment]}
            </span>
            <span className="text-[10px] text-[var(--undp-gray)]">
              {docA} {targetA.sourceLabel} {isContra ? "↮" : "↔"} {docB}{" "}
              {targetB.sourceLabel}
            </span>
          </div>
          <p
            className="text-[12px] text-[var(--undp-black)] leading-snug overflow-hidden"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            <span className="text-[var(--undp-gray)]">A:</span> {targetA.text}
          </p>
          <p
            className="text-[12px] text-[var(--undp-black)] leading-snug overflow-hidden mt-0.5"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            <span className="text-[var(--undp-gray)]">B:</span> {targetB.text}
          </p>
        </div>
      </button>
    </li>
  );
}
