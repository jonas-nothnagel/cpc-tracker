"use client";

/**
 * ThemeDrawer — opens when the user clicks a corpus-theme chip on the
 * findings home. Drills into the underlying target pairs grouped by the
 * doc-pairs the storyline names as contributors.
 *
 * Per round-2 feedback: theme chips used to only filter the doc-pair
 * ranking and ghost the wheel. The user wanted to *see* the target
 * pairs that make up each theme — "groups of major gaps and target
 * pairs as examples per theme". This drawer is that drill-down.
 *
 * Per v2.1 audit: every flagged example row surfaces the new
 * sub-fields (mechanism / manageability / confidence) so reviewers can
 * triage low-confidence flags at a glance. Sorting puts the most
 * decision-relevant pairs first — for friction themes, that's
 * fundamental + high-confidence flagged pairs; for reinforcement
 * themes, the strongest alignments.
 */

import { useEffect, useMemo, useState } from "react";
import {
  ALIGNMENT_COLORS,
  ALIGNMENT_LABELS,
  CONFIDENCE_LABELS,
  CONTRADICTION_TYPE_LABELS,
  MANAGEABILITY_LABELS,
  MECHANISM_COLORS,
  getDocFullLabel,
  getDocMediumLabel,
} from "@/lib/utils";
import {
  getDocPairKey,
  parseContributingDocPair,
} from "@/lib/coherence-briefing";
import type {
  AlignmentConfidence,
  AlignmentLevel,
  AlignmentManageability,
  AlignmentMechanism,
  AlignmentResult,
  CorpusStoryline,
  CountryConfig,
  Target,
} from "@/types";

const HEADLINE_SERIF =
  "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif";
const ALIGNED_DOT_COLOR = "#196127";
const FRICTION_DOT_COLOR = "#dc2626";
const AI_DISCLAIMER =
  "AI-generated synthesis. Treat as a prompt to review, not a settled finding.";

const SEVERITY_RANK: Record<AlignmentLevel, number> = {
  flagged: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 99,
};
const CONFIDENCE_RANK: Record<AlignmentConfidence, number> = {
  high: 0,
  medium: 1,
  low: 2,
};
const MANAGEABILITY_RANK: Record<AlignmentManageability, number> = {
  fundamental: 0,
  manageable: 1,
};

const DEFAULT_ROWS_PER_GROUP = 4;

export interface ThemeDrawerProps {
  theme: CorpusStoryline | null;
  /**
   * Populated when the user opens the drawer in "browse all storylines" mode
   * from the Direction slide's "See all" trigger. Mutually exclusive with
   * `theme`: when both are set, the single-storyline view wins.
   */
  allStorylines: CorpusStoryline[] | null;
  alignment: AlignmentResult[];
  targetsById: Map<string, Target>;
  countryConfig: CountryConfig | null;
  onClose: () => void;
  /**
   * Fired when the user picks one storyline from the all-storylines grid.
   * The parent should set `theme` to the picked storyline (and may clear
   * `allStorylines` if it wants the back button to dismiss the drawer
   * directly instead of returning to the grid).
   */
  onOpenSingleTheme?: (storyline: CorpusStoryline) => void;
  onOpenTargetPair: (
    pair: AlignmentResult,
    targetA: Target,
    targetB: Target,
  ) => void;
}

export function ThemeDrawer({
  theme,
  allStorylines,
  alignment,
  targetsById,
  countryConfig,
  onClose,
  onOpenSingleTheme,
  onOpenTargetPair,
}: ThemeDrawerProps) {
  const isOpen = theme !== null || allStorylines !== null;
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const groups = useMemo<DocPairGroup[]>(() => {
    if (!theme) return [];
    const out: DocPairGroup[] = [];
    const seenKeys = new Set<string>();
    for (const raw of theme.contributing_doc_pairs) {
      const parsed = parseContributingDocPair(raw);
      if (!parsed) continue;
      const key = getDocPairKey(parsed.a, parsed.b);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const records: AlignmentResult[] = [];
      for (const r of alignment) {
        if (r.alignment === "none") continue;
        const tA = targetsById.get(r.targetAId);
        const tB = targetsById.get(r.targetBId);
        if (!tA || !tB) continue;
        const sA = tA.sourceDocument;
        const sB = tB.sourceDocument;
        if (
          (sA === parsed.a && sB === parsed.b) ||
          (sA === parsed.b && sB === parsed.a)
        ) {
          // Filter to records that match the theme polarity. Friction
          // themes show only flagged; reinforcement themes show only
          // medium+high aligned (low alignment is too weak to read as
          // "reinforcing"; matches the verdict computation in
          // coherence-briefing.ts).
          if (theme.type === "friction") {
            if (r.alignment === "flagged") records.push(r);
          } else if (r.alignment === "medium" || r.alignment === "high") {
            records.push(r);
          }
        }
      }

      records.sort(
        theme.type === "friction"
          ? compareFlaggedByReviewPriority
          : compareAlignedByStrength,
      );

      out.push({ a: parsed.a, b: parsed.b, key, records });
    }
    out.sort((x, y) => y.records.length - x.records.length);
    return out;
  }, [theme, alignment, targetsById]);

  if (!theme && allStorylines) {
    return (
      <AllStorylinesView
        storylines={allStorylines}
        onPick={(s) => onOpenSingleTheme?.(s)}
        onClose={onClose}
      />
    );
  }

  if (!theme) return null;

  const isReinforce = theme.type === "reinforcement";
  const dotColor = isReinforce ? ALIGNED_DOT_COLOR : FRICTION_DOT_COLOR;
  const totalRecords = groups.reduce((s, g) => s + g.records.length, 0);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="Close theme view"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--undp-black)]/40 backdrop-blur-sm"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Theme: ${theme.name}`}
        className="relative h-full w-full sm:w-[560px] md:w-[640px] shadow-2xl overflow-y-auto"
        style={{ backgroundColor: "#fbfaf7" }}
      >
        <header className="sticky top-0 z-10 px-6 py-4 border-b border-gray-200 flex items-start justify-between gap-4 bg-white/90 backdrop-blur">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span
                aria-hidden="true"
                className="block h-2.5 w-2.5 rounded-full shrink-0"
                style={
                  isReinforce
                    ? { backgroundColor: dotColor }
                    : { boxShadow: `inset 0 0 0 1.5px ${dotColor}` }
                }
              />
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--undp-gray)]">
                {isReinforce
                  ? "Recurring alignment"
                  : "Recurring potential misalignment"}
              </p>
            </div>
            <h3
              className="text-xl text-[var(--undp-black)] font-medium leading-snug"
              style={{ fontFamily: HEADLINE_SERIF }}
            >
              {theme.name}
            </h3>
            <p className="mt-1 text-[11px] text-[var(--undp-gray)] tabular-nums">
              Recurs across {theme.spans_documents.length} doc
              {theme.spans_documents.length === 1 ? "" : "s"} ·{" "}
              {theme.pair_count.toLocaleString()} pair
              {theme.pair_count === 1 ? "" : "s"} ·{" "}
              {totalRecords.toLocaleString()}{" "}
              {isReinforce ? "aligned" : "misaligned"} record
              {totalRecords === 1 ? "" : "s"} below
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--undp-gray)] hover:text-[var(--undp-black)] text-2xl leading-none shrink-0"
          >
            ×
          </button>
        </header>

        <div className="px-6 py-6 space-y-6">
          <p className="text-[14px] text-[var(--undp-black)] leading-relaxed">
            {theme.description}
          </p>

          <section>
            <p className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)] mb-3">
              Target pairs in this theme
            </p>
            {groups.length === 0 || totalRecords === 0 ? (
              <p className="text-sm italic text-[var(--undp-gray)]">
                The theme names contributing doc-pairs but no concrete
                target pairs in those doc-pairs match the theme polarity.
              </p>
            ) : (
              <div className="space-y-6">
                {groups.map((g) => (
                  <DocPairGroupBlock
                    key={g.key}
                    group={g}
                    countryConfig={countryConfig}
                    targetsById={targetsById}
                    onOpenTargetPair={onOpenTargetPair}
                  />
                ))}
              </div>
            )}
          </section>

          <p className="text-[10px] text-[var(--undp-gray)] leading-relaxed">
            {AI_DISCLAIMER}
          </p>
        </div>
      </aside>
    </div>
  );
}

interface DocPairGroup {
  a: string;
  b: string;
  key: string;
  records: AlignmentResult[];
}

function DocPairGroupBlock({
  group,
  countryConfig,
  targetsById,
  onOpenTargetPair,
}: {
  group: DocPairGroup;
  countryConfig: CountryConfig | null;
  targetsById: Map<string, Target>;
  onOpenTargetPair: (
    pair: AlignmentResult,
    targetA: Target,
    targetB: Target,
  ) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const labelA = getDocMediumLabel(countryConfig, group.a);
  const labelB = getDocMediumLabel(countryConfig, group.b);
  const fullA = getDocFullLabel(countryConfig, group.a);
  const fullB = getDocFullLabel(countryConfig, group.b);
  const visible = expanded
    ? group.records
    : group.records.slice(0, DEFAULT_ROWS_PER_GROUP);
  if (group.records.length === 0) {
    return null;
  }
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2 flex-wrap">
        <p
          className="text-[13px] text-[var(--undp-black)] font-medium"
          style={{ fontFamily: HEADLINE_SERIF }}
          title={`${fullA} ↔ ${fullB}`}
        >
          {labelA} ↔ {labelB}
        </p>
        <p className="text-[10px] text-[var(--undp-gray)] tabular-nums">
          {group.records.length.toLocaleString()} record
          {group.records.length === 1 ? "" : "s"}
        </p>
      </div>
      <ol className="divide-y divide-gray-200 border-y border-gray-200">
        {visible.map((p) => {
          const tA = targetsById.get(p.targetAId);
          const tB = targetsById.get(p.targetBId);
          if (!tA || !tB) return null;
          return (
            <ExampleRow
              key={`${p.targetAId}__${p.targetBId}`}
              pair={p}
              targetA={tA}
              targetB={tB}
              countryConfig={countryConfig}
              onOpen={() => onOpenTargetPair(p, tA, tB)}
            />
          );
        })}
      </ol>
      {group.records.length > DEFAULT_ROWS_PER_GROUP && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-[11px] text-[var(--undp-gray)] hover:text-[var(--undp-black)] underline"
        >
          {expanded
            ? "Show fewer"
            : `Show all ${group.records.length.toLocaleString()} record${group.records.length === 1 ? "" : "s"}`}
        </button>
      )}
    </div>
  );
}

function ExampleRow({
  pair,
  targetA,
  targetB,
  countryConfig,
  onOpen,
}: {
  pair: AlignmentResult;
  targetA: Target;
  targetB: Target;
  countryConfig: CountryConfig | null;
  onOpen: () => void;
}) {
  const color = ALIGNMENT_COLORS[pair.alignment];
  const docA = getDocMediumLabel(countryConfig, targetA.sourceDocument);
  const docB = getDocMediumLabel(countryConfig, targetB.sourceDocument);
  const isFlagged = pair.alignment === "flagged";
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-left py-2.5 px-1 hover:bg-gray-50 rounded transition-colors"
      >
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
          {isFlagged && pair.mechanism && (
            <SubFieldChip variant="mechanism" value={pair.mechanism} />
          )}
          <span className="text-[10px] text-[var(--undp-gray)]">
            {docA} {targetA.sourceLabel} ↔ {docB} {targetB.sourceLabel}
          </span>
        </div>
        {pair.description && (
          <p
            className="text-[12px] text-[var(--undp-black)] leading-snug italic overflow-hidden"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {pair.description}
          </p>
        )}
      </button>
    </li>
  );
}

/**
 * Small chip rendering the v2.1 sub-fields on a flagged pair.
 * Variant choices match the audit recommendation: confidence chip uses
 * a dashed outline for low-confidence so reviewers can spot
 * "review-optional" rows at a glance without dropping them.
 */
export function SubFieldChip({
  variant,
  value,
}: {
  variant: "mechanism" | "manageability" | "confidence";
  value: AlignmentMechanism | AlignmentManageability | AlignmentConfidence;
}) {
  if (variant === "mechanism") {
    // Colour per the friction-type palette (same as the bar) so the mechanism
    // reads as a warm severity ramp and is never confused with the neutral
    // slate manageability chip.
    const c = MECHANISM_COLORS[value as AlignmentMechanism];
    return (
      <span
        className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full border"
        style={{
          color: c,
          borderColor: `${c}55`,
          backgroundColor: `${c}14`,
        }}
      >
        {CONTRADICTION_TYPE_LABELS[value as AlignmentMechanism]}
      </span>
    );
  }
  if (variant === "manageability") {
    // Neutral slate for both values: the renamed labels describe WHERE the
    // friction sits (coordination-level vs design-level), not a verdict, so
    // the old red "fundamental" treatment would re-introduce the judgy tone.
    return (
      <span
        className="text-[9px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded-full border"
        style={{
          color: "#475569",
          borderColor: "#cbd5e1",
          backgroundColor: "#f1f5f9",
        }}
      >
        {MANAGEABILITY_LABELS[value as AlignmentManageability]}
      </span>
    );
  }
  // confidence
  const low = value === "low";
  return (
    <span
      className="text-[9px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded-full"
      style={{
        color: low ? "#92400e" : "#475569",
        backgroundColor: low ? "#fffbeb" : "#f1f5f9",
        border: low ? "1px dashed #f59e0b" : "1px solid #cbd5e1",
      }}
    >
      {CONFIDENCE_LABELS[value as AlignmentConfidence]}
    </span>
  );
}

function compareFlaggedByReviewPriority(
  x: AlignmentResult,
  y: AlignmentResult,
): number {
  // Both rows are flagged. Sort by: fundamental first → confidence desc
  // (high > medium > low) → fall back to record order. This puts the
  // pairs that warrant human attention at the top per the v2.1 audit.
  const mx = x.manageability;
  const my = y.manageability;
  const mScore =
    (mx ? MANAGEABILITY_RANK[mx] : 9) - (my ? MANAGEABILITY_RANK[my] : 9);
  if (mScore !== 0) return mScore;
  const cx = x.confidence;
  const cy = y.confidence;
  const cScore =
    (cx ? CONFIDENCE_RANK[cx] : 9) - (cy ? CONFIDENCE_RANK[cy] : 9);
  return cScore;
}

function compareAlignedByStrength(
  x: AlignmentResult,
  y: AlignmentResult,
): number {
  // For reinforcement themes: high > medium. (Low is filtered out
  // above; "none" never reaches here.)
  return SEVERITY_RANK[x.alignment] - SEVERITY_RANK[y.alignment];
}

// ─── All-storylines browse view ──────────────────────────────────────

function AllStorylinesView({
  storylines,
  onPick,
  onClose,
}: {
  storylines: CorpusStoryline[];
  onPick: (s: CorpusStoryline) => void;
  onClose: () => void;
}) {
  const reinforce = storylines.filter((s) => s.type === "reinforcement");
  const friction = storylines.filter((s) => s.type === "friction");
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="Close themes view"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--undp-black)]/40 backdrop-blur-sm"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="All recurring themes"
        className="relative h-full w-full sm:w-[560px] md:w-[640px] shadow-2xl overflow-y-auto"
        style={{ backgroundColor: "#fbfaf7" }}
      >
        <header className="sticky top-0 z-10 px-6 py-4 border-b border-gray-200 flex items-start justify-between gap-4 bg-white/90 backdrop-blur">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-1.5">
              Recurring themes
            </p>
            <h3
              className="text-xl text-[var(--undp-black)] font-medium leading-snug"
              style={{ fontFamily: HEADLINE_SERIF }}
            >
              {storylines.length.toLocaleString()} themes that span multiple
              documents
            </h3>
            <p className="mt-1 text-[11px] text-[var(--undp-gray)] tabular-nums">
              {reinforce.length.toLocaleString()} aligned ·{" "}
              {friction.length.toLocaleString()} potentially misaligned. Click
              any theme for the underlying target pairs.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--undp-gray)] hover:text-[var(--undp-black)] text-2xl leading-none shrink-0"
          >
            ×
          </button>
        </header>

        <div className="px-6 py-6 space-y-6">
          {reinforce.length > 0 && (
            <StorylineGroup
              label="Recurring alignment"
              tone="reinforce"
              storylines={reinforce}
              onPick={onPick}
            />
          )}
          {friction.length > 0 && (
            <StorylineGroup
              label="Recurring potential misalignment"
              tone="friction"
              storylines={friction}
              onPick={onPick}
            />
          )}
          <p className="text-[10px] text-[var(--undp-gray)] leading-relaxed">
            {AI_DISCLAIMER}
          </p>
        </div>
      </aside>
    </div>
  );
}

function StorylineGroup({
  label,
  tone,
  storylines,
  onPick,
}: {
  label: string;
  tone: "reinforce" | "friction";
  storylines: CorpusStoryline[];
  onPick: (s: CorpusStoryline) => void;
}) {
  const dotColor = tone === "reinforce" ? ALIGNED_DOT_COLOR : FRICTION_DOT_COLOR;
  const sorted = [...storylines].sort((a, b) => {
    const aRank = CONFIDENCE_RANK[a.confidence] ?? 3;
    const bRank = CONFIDENCE_RANK[b.confidence] ?? 3;
    if (aRank !== bRank) return aRank - bRank;
    return b.pair_count - a.pair_count;
  });
  return (
    <section>
      <p className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)] mb-2">
        {label}
      </p>
      <ul className="space-y-2">
        {sorted.map((s) => (
          <li key={s.name}>
            <button
              type="button"
              onClick={() => onPick(s)}
              className="w-full text-left rounded border border-gray-200 bg-white px-3 py-2.5 hover:border-gray-400 transition-colors"
            >
              <div className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className="mt-1.5 block h-2 w-2 rounded-full shrink-0"
                  style={
                    tone === "reinforce"
                      ? { backgroundColor: dotColor }
                      : { boxShadow: `inset 0 0 0 1px ${dotColor}` }
                  }
                />
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[13.5px] text-[var(--undp-black)] leading-snug"
                    style={{ fontFamily: HEADLINE_SERIF }}
                  >
                    {s.name}
                  </p>
                  <p className="mt-1 text-[10.5px] text-[var(--undp-gray)] tabular-nums">
                    Spans {s.spans_documents.length} doc
                    {s.spans_documents.length === 1 ? "" : "s"} ·{" "}
                    {s.pair_count.toLocaleString()} pair
                    {s.pair_count === 1 ? "" : "s"}
                    {s.confidence === "low"
                      ? " · low confidence"
                      : ""}
                  </p>
                </div>
                <span
                  aria-hidden="true"
                  className="text-[var(--undp-gray)] text-[12px] mt-0.5"
                >
                  →
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
