"use client";

/**
 * Relationships section — Section 3 of the findings home.
 *
 * Three layers, top to bottom:
 *   1. Corpus summary paragraph (3-4 sentences) from corpus_themes.json.
 *   2. Theme chips — reinforce + friction storylines from the same JSON.
 *      Multi-select; click chips to filter the doc-pair ranking and ghost
 *      the wheel to the docs the selected themes span.
 *   3. Doc-pair ranking — synthesised storyline per cross-doc pair from
 *      doc_pair_synthesis.json, sorted by total signal. Balance bar shows
 *      aligned / flagged split. Click a row → doc-pair drawer.
 *
 * If the synthesis JSONs are absent (older runs), falls back to the legacy
 * fault-line list. The exported section id constant stays "misalignments"
 * so jump-nav + deep-links keep working during the demo phase.
 */

import {
  computeDocPairBalance,
  getDocPairKey,
  getStorylineDocPairKeys,
  type DocPairDisagreement,
  type FaultLine,
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

export type ThemeTypeFilter = "all" | "reinforcement" | "friction";

export function RelationshipsSection({
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
}: {
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

  return (
    <section
      id={MISALIGNMENTS_SECTION_ID}
      className="scroll-mt-24 pt-2"
      aria-labelledby={`${MISALIGNMENTS_SECTION_ID}-heading`}
    >
      <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--undp-gray)] mb-2">
        How documents relate
      </p>
      <h2
        id={`${MISALIGNMENTS_SECTION_ID}-heading`}
        className="text-[28px] sm:text-[32px] leading-[1.15] text-[var(--undp-black)] font-medium mb-4"
        style={{ fontFamily: HEADLINE_SERIF }}
      >
        Where the policy set reinforces, and where it clashes.
      </h2>

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
    </section>
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
                backgroundColor: ALIGNMENT_COLORS.possible_conflict,
                opacity: failed ? 0.4 : 0.95,
              }}
            />
          </div>
          <p className="text-[12px] text-[var(--undp-black)] tabular-nums font-medium whitespace-nowrap">
            <span style={{ color: ALIGNMENT_COLORS.high }}>
              {dp.aligned_count.toLocaleString()} aligned
            </span>
            <span className="text-[var(--undp-gray)] mx-1">·</span>
            <span style={{ color: ALIGNMENT_COLORS.possible_conflict }}>
              {dp.flagged_count.toLocaleString()} flagged
            </span>
          </p>
        </div>
      </button>
    </li>
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
