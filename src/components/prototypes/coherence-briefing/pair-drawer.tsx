"use client";

/**
 * PairDrawer — side drawer for either a single target-pair (clicked from a
 * fault-line row or wheel chord) or a whole doc-pair (clicked from Section 3
 * ranking). The two modes share the same chrome (slide-in, Escape closes,
 * body scroll locks) but render different bodies via a discriminated union.
 *
 * Doc-pair mode shows the LLM synthesis (reinforce + clash + coordination
 * hint), a prominent counts strip, and a flagged-only list of target-pairs
 * with a "Show aligned" expand. Clicking a target-pair row pivots to
 * target-pair mode, with a Back button to return to the doc-pair view.
 *
 * Target-pair mode renders the existing two-target card view + AI rationale.
 */

import { useEffect, useMemo, useState } from "react";
import {
  ALIGNMENT_COLORS,
  ALIGNMENT_LABELS,
  CONTRADICTION_TYPE_LABELS,
  getDocMediumLabel,
  getDocFullLabel,
} from "@/lib/utils";
import { isContradiction } from "@/types";
import { SubFieldChip } from "./theme-drawer";
import type {
  AlignmentConfidence,
  AlignmentLevel,
  AlignmentResult,
  CountryConfig,
  DocPairSynthesis,
  Target,
} from "@/types";

const EXAMPLES_DEFAULT_COUNT = 3;

const HEADLINE_SERIF =
  "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif";
const ALIGNED_DOT_COLOR = "#196127";
const FRICTION_DOT_COLOR = "#dc2626";
const AI_DISCLAIMER =
  "AI-generated synthesis. Treat as a prompt to review, not a settled finding.";

const SEVERITY_RANK: Record<AlignmentLevel, number> = {
  flagged: 0,
  high: 10,
  medium: 11,
  low: 12,
  none: 99,
};

export type PairDrawerData =
  | {
      mode: "target-pair";
      pair: AlignmentResult;
      targetA: Target;
      targetB: Target;
    }
  | {
      mode: "doc-pair";
      docPair: DocPairSynthesis;
      pairs: AlignmentResult[];
      targetsById: Map<string, Target>;
    };

export function PairDrawer({
  data,
  countryConfig,
  onClose,
}: {
  data: PairDrawerData | null;
  countryConfig: CountryConfig | null;
  onClose: () => void;
}) {
  // Nested mode state — when the user clicks a target-pair row inside a doc-
  // pair view, we remount the body in target-pair mode but remember the
  // doc-pair so a Back button can return without re-opening from the page.
  const [nested, setNested] = useState<{
    parent: Extract<PairDrawerData, { mode: "doc-pair" }>;
    inner: Extract<PairDrawerData, { mode: "target-pair" }>;
  } | null>(null);

  // Reset nested state whenever the outer `data` reference changes. Using
  // the React 19 "reset state when prop changes" idiom rather than useEffect
  // to avoid cascading-render warnings.
  const [prevData, setPrevData] = useState(data);
  if (prevData !== data) {
    setPrevData(data);
    setNested(null);
  }

  useEffect(() => {
    if (!data) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (nested) {
          setNested(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data, onClose, nested]);

  useEffect(() => {
    if (!data) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [data]);

  if (!data) return null;

  // Resolve the body to render: outer doc-pair, an explicitly nested target-
  // pair inside it, or a direct target-pair from a non-Section-3 caller.
  const renderData: PairDrawerData = nested ? nested.inner : data;

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <button
        type="button"
        aria-label="Close pair detail"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--undp-black)]/40 backdrop-blur-sm"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={
          renderData.mode === "doc-pair" ? "Document pair detail" : "Pair detail"
        }
        className="relative h-full w-full sm:w-[560px] md:w-[640px] shadow-2xl overflow-y-auto"
        style={{ backgroundColor: "#fbfaf7" }}
      >
        {nested && (
          <button
            type="button"
            onClick={() => setNested(null)}
            className="sticky top-0 z-20 w-full text-left text-[11px] text-[var(--undp-gray)] hover:text-[var(--undp-black)] px-6 py-2 bg-white/90 backdrop-blur border-b border-gray-200"
          >
            ← Back to {getDocMediumLabel(countryConfig, nested.parent.docPair.doc_a)} ↔{" "}
            {getDocMediumLabel(countryConfig, nested.parent.docPair.doc_b)}
          </button>
        )}
        {renderData.mode === "target-pair" ? (
          <TargetPairBody
            pair={renderData.pair}
            targetA={renderData.targetA}
            targetB={renderData.targetB}
            countryConfig={countryConfig}
            onClose={onClose}
          />
        ) : (
          <DocPairBody
            docPair={renderData.docPair}
            pairs={renderData.pairs}
            targetsById={renderData.targetsById}
            countryConfig={countryConfig}
            onClose={onClose}
            onOpenTargetPair={(pair, targetA, targetB) =>
              setNested({
                parent: renderData,
                inner: { mode: "target-pair", pair, targetA, targetB },
              })
            }
          />
        )}
      </aside>
    </div>
  );
}

// ─── Target-pair body (existing layout) ────────────────────────────

function TargetPairBody({
  pair,
  targetA,
  targetB,
  countryConfig,
  onClose,
}: {
  pair: AlignmentResult;
  targetA: Target;
  targetB: Target;
  countryConfig: CountryConfig | null;
  onClose: () => void;
}) {
  const color = ALIGNMENT_COLORS[pair.alignment];
  const contra = isContradiction(pair.alignment);
  return (
    <>
      <header className="sticky top-0 z-10 px-6 py-4 border-b border-gray-200 flex items-start justify-between gap-4 bg-white/90 backdrop-blur">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-1">
            Pair detail
          </p>
          <h3
            className="text-xl text-[var(--undp-black)] font-medium leading-tight"
            style={{ fontFamily: HEADLINE_SERIF }}
          >
            {ALIGNMENT_LABELS[pair.alignment]}
            {pair.mechanism && (
              <span className="block text-xs font-normal text-[var(--undp-gray)] mt-1">
                {CONTRADICTION_TYPE_LABELS[pair.mechanism]}
              </span>
            )}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-[var(--undp-gray)] hover:text-[var(--undp-black)] text-2xl leading-none"
        >
          ×
        </button>
      </header>

      <div className="px-6 py-6 space-y-5">
        <TargetCard
          target={targetA}
          countryConfig={countryConfig}
          color={color}
        />
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="block h-px flex-1"
            style={{
              backgroundImage: `linear-gradient(90deg, transparent, ${color}, transparent)`,
            }}
          />
          <span
            className="text-[10px] uppercase tracking-wider font-medium"
            style={{ color }}
          >
            {contra ? "possibly misaligned with" : "supports"}
          </span>
          <span
            aria-hidden="true"
            className="block h-px flex-1"
            style={{
              backgroundImage: `linear-gradient(90deg, transparent, ${color}, transparent)`,
            }}
          />
        </div>
        <TargetCard
          target={targetB}
          countryConfig={countryConfig}
          color={color}
        />

        {pair.description && (
          <section className="border-t border-gray-200 pt-4">
            <p className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)] mb-2">
              AI rationale
            </p>
            <p className="text-sm text-[var(--undp-black)] leading-relaxed italic">
              {pair.description}
            </p>
            <p className="mt-3 text-[10px] text-[var(--undp-gray)] leading-relaxed">
              AI-generated assessment of this pair. Treat as a prompt to
              review, not a settled finding.
            </p>
          </section>
        )}
      </div>
    </>
  );
}

function TargetCard({
  target,
  countryConfig,
  color,
}: {
  target: Target;
  countryConfig: CountryConfig | null;
  color: string;
}) {
  const docLabel = getDocMediumLabel(countryConfig, target.sourceDocument);
  const docFull = getDocFullLabel(countryConfig, target.sourceDocument);
  return (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <p
        className="text-[10px] uppercase tracking-wider font-medium mb-2"
        style={{ color }}
      >
        {docLabel} · {target.sourceLabel}
      </p>
      <p className="text-sm text-[var(--undp-black)] leading-relaxed">
        {target.text}
      </p>
      {(target.isQuantitative || target.isTimeBound) && (
        <p className="mt-2 text-[10px] text-[var(--undp-gray)] uppercase tracking-wider">
          {[
            target.isQuantitative ? "Quantitative" : null,
            target.isTimeBound ? "Time-bound" : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      <p className="mt-2 text-[10px] text-[var(--undp-gray)]">
        Source: {docFull}
      </p>
    </div>
  );
}

// ─── Doc-pair body ─────────────────────────────────────────────────

function DocPairBody({
  docPair,
  pairs,
  targetsById,
  countryConfig,
  onClose,
  onOpenTargetPair,
}: {
  docPair: DocPairSynthesis;
  pairs: AlignmentResult[];
  targetsById: Map<string, Target>;
  countryConfig: CountryConfig | null;
  onClose: () => void;
  onOpenTargetPair: (
    pair: AlignmentResult,
    targetA: Target,
    targetB: Target,
  ) => void;
}) {
  const labelAFull = getDocFullLabel(countryConfig, docPair.doc_a);
  const labelBFull = getDocFullLabel(countryConfig, docPair.doc_b);

  // Round-2 restructure: flagged + aligned pairs are split into example
  // sub-lists that live BENEATH each synthesis panel rather than as a
  // separate target-pair list further down. Flagged side is sorted by
  // review priority (fundamental first → confidence desc) so the most
  // decision-relevant pairs surface first. Aligned side is sorted by
  // alignment strength (high → medium → low).
  const { flaggedPairs, alignedPairs } = useMemo(() => {
    const flagged: AlignmentResult[] = [];
    const aligned: AlignmentResult[] = [];
    for (const p of pairs) {
      if (p.alignment === "none") continue;
      if (isContradiction(p.alignment)) flagged.push(p);
      else aligned.push(p);
    }
    flagged.sort(compareFlaggedByReviewPriority);
    aligned.sort((x, y) => SEVERITY_RANK[x.alignment] - SEVERITY_RANK[y.alignment]);
    return { flaggedPairs: flagged, alignedPairs: aligned };
  }, [pairs]);

  const failed = docPair.synthesis_error !== null;

  return (
    <>
      <header className="sticky top-0 z-10 px-6 py-4 bg-white/90 backdrop-blur border-b border-gray-200">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-1">
              Document pair
            </p>
            <h3
              className="text-xl text-[var(--undp-black)] font-medium leading-tight truncate"
              style={{ fontFamily: HEADLINE_SERIF }}
            >
              {labelAFull} ↔ {labelBFull}
            </h3>
            {!failed && (
              <p
                className="mt-1 text-[13px] text-[var(--undp-gray)] leading-snug"
                style={{ fontFamily: HEADLINE_SERIF }}
              >
                {docPair.synthesis.storyline_name}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--undp-gray)] hover:text-[var(--undp-black)] text-2xl leading-none shrink-0"
          >
            ×
          </button>
        </div>
      </header>

      <div className="px-6 py-6 space-y-6">
        {!failed && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SynthesisPanelWithExamples
              label="Reinforces"
              dotColor={ALIGNED_DOT_COLOR}
              body={docPair.synthesis.reinforce}
              examples={alignedPairs}
              emptyText="No medium-or-strong aligned pairs in this doc-pair."
              variant="aligned"
              targetsById={targetsById}
              countryConfig={countryConfig}
              onOpenTargetPair={onOpenTargetPair}
              totalCount={alignedPairs.length}
            />
            <SynthesisPanelWithExamples
              label="Flagged for review"
              dotColor={FRICTION_DOT_COLOR}
              dashed
              body={docPair.synthesis.clash}
              examples={flaggedPairs}
              emptyText="No flagged pairs in this doc-pair."
              variant="flagged"
              targetsById={targetsById}
              countryConfig={countryConfig}
              onOpenTargetPair={onOpenTargetPair}
              totalCount={flaggedPairs.length}
            />
          </div>
        )}
        {!failed && docPair.synthesis.coordination_hint && (
          <div className="border-l-2 border-gray-300 pl-3">
            <p className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)] mb-1">
              Coordination pathway
            </p>
            <p className="text-[13px] text-[var(--undp-black)] leading-relaxed italic">
              {docPair.synthesis.coordination_hint}
            </p>
          </div>
        )}
        <CountsStrip docPair={docPair} />
        <p className="text-[10px] text-[var(--undp-gray)] leading-relaxed">
          {AI_DISCLAIMER}
        </p>

        {failed && (
          // Synthesis failed → fall back to the legacy flat list so the
          // drawer still shows raw target-pair data.
          <FallbackTargetPairList
            flaggedPairs={flaggedPairs}
            alignedPairs={alignedPairs}
            targetsById={targetsById}
            countryConfig={countryConfig}
            onOpenTargetPair={onOpenTargetPair}
          />
        )}
      </div>
    </>
  );
}

const CONFIDENCE_RANK: Record<AlignmentConfidence, number> = {
  high: 0,
  medium: 1,
  low: 2,
};
const MANAGEABILITY_RANK = {
  fundamental: 0,
  manageable: 1,
} as const;

function compareFlaggedByReviewPriority(
  x: AlignmentResult,
  y: AlignmentResult,
): number {
  // Fundamental first → confidence desc (high > medium > low) → SEVERITY
  // fallback so the order is deterministic.
  const mx = x.manageability;
  const my = y.manageability;
  const mScore =
    (mx ? MANAGEABILITY_RANK[mx] : 9) - (my ? MANAGEABILITY_RANK[my] : 9);
  if (mScore !== 0) return mScore;
  const cx = x.confidence;
  const cy = y.confidence;
  const cScore =
    (cx ? CONFIDENCE_RANK[cx] : 9) - (cy ? CONFIDENCE_RANK[cy] : 9);
  if (cScore !== 0) return cScore;
  return SEVERITY_RANK[x.alignment] - SEVERITY_RANK[y.alignment];
}

function SynthesisPanelWithExamples({
  label,
  dotColor,
  dashed,
  body,
  examples,
  emptyText,
  variant,
  targetsById,
  countryConfig,
  onOpenTargetPair,
  totalCount,
}: {
  label: string;
  dotColor: string;
  dashed?: boolean;
  body: string;
  examples: AlignmentResult[];
  emptyText: string;
  variant: "aligned" | "flagged";
  targetsById: Map<string, Target>;
  countryConfig: CountryConfig | null;
  onOpenTargetPair: (
    pair: AlignmentResult,
    targetA: Target,
    targetB: Target,
  ) => void;
  totalCount: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded
    ? examples
    : examples.slice(0, EXAMPLES_DEFAULT_COUNT);
  const remaining = examples.length - EXAMPLES_DEFAULT_COUNT;
  return (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-2">
        <span
          aria-hidden="true"
          className="block h-2.5 w-2.5 rounded-full"
          style={
            dashed
              ? { boxShadow: `inset 0 0 0 1px ${dotColor}` }
              : { backgroundColor: dotColor }
          }
        />
        <p className="text-[10px] uppercase tracking-wider text-[var(--undp-black)] font-medium">
          {label}
        </p>
      </div>
      <p className="text-[13px] text-[var(--undp-black)] leading-relaxed mb-4">
        {body}
      </p>
      <div className="mt-4 border-t border-gray-200 pt-3">
        <p className="text-[9px] uppercase tracking-wider text-[var(--undp-gray)] mb-2.5">
          {variant === "flagged"
            ? `Examples flagged for review (${examples.length.toLocaleString()}${
                examples.length !== totalCount
                  ? ` of ${totalCount.toLocaleString()}`
                  : ""
              })`
            : `Examples reinforcing this (${examples.length.toLocaleString()})`}
        </p>
        {visible.length === 0 ? (
          <p className="text-[11px] italic text-[var(--undp-gray)]">
            {emptyText}
          </p>
        ) : (
          <ol className="space-y-2">
            {visible.map((p) => {
              const tA = targetsById.get(p.targetAId);
              const tB = targetsById.get(p.targetBId);
              if (!tA || !tB) return null;
              return (
                <TargetPairRow
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
        )}
        {remaining > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 text-[10px] text-[var(--undp-gray)] hover:text-[var(--undp-black)] underline"
          >
            {expanded
              ? "Show fewer"
              : `Show ${remaining.toLocaleString()} more`}
          </button>
        )}
      </div>
    </div>
  );
}

function CountsStrip({ docPair }: { docPair: DocPairSynthesis }) {
  // v2.1 canonical mechanism keys + legacy v1 fallback. Older synthesis
  // JSON written before the v2 migration emits `implementation_tension`
  // and `scale_scope_mismatch`; fold both into delivery_friction so the
  // subtype counts still total correctly.
  const ct = docPair.contradiction_types;
  const merged = {
    goal_conflict: ct.goal_conflict ?? 0,
    resource_competition: ct.resource_competition ?? 0,
    delivery_friction:
      (ct.delivery_friction ?? 0) +
      (ct.implementation_tension ?? 0) +
      (ct.scale_scope_mismatch ?? 0),
  };
  const parts: string[] = [];
  if (merged.goal_conflict) {
    parts.push(
      `${CONTRADICTION_TYPE_LABELS.goal_conflict.toLowerCase()} (${merged.goal_conflict.toLocaleString()})`,
    );
  }
  if (merged.resource_competition) {
    parts.push(
      `${CONTRADICTION_TYPE_LABELS.resource_competition.toLowerCase()} (${merged.resource_competition.toLocaleString()})`,
    );
  }
  if (merged.delivery_friction) {
    parts.push(
      `${CONTRADICTION_TYPE_LABELS.delivery_friction.toLowerCase()} (${merged.delivery_friction.toLocaleString()})`,
    );
  }
  return (
    <div className="border-t border-gray-200 pt-4">
      <p className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)] mb-2">
        Pool composition
      </p>
      <p className="text-[15px] text-[var(--undp-black)] tabular-nums font-medium">
        <span style={{ color: ALIGNMENT_COLORS.high }}>
          {docPair.aligned_count.toLocaleString()} aligned
        </span>
        <span className="text-[var(--undp-gray)] mx-2">·</span>
        <span style={{ color: ALIGNMENT_COLORS.flagged }}>
          {docPair.flagged_count.toLocaleString()} flagged
        </span>
      </p>
      {parts.length > 0 && (
        <p className="mt-1 text-[11px] text-[var(--undp-gray)] tabular-nums">
          Flagged subtypes: {parts.join(", ")}
        </p>
      )}
    </div>
  );
}

function FallbackTargetPairList({
  flaggedPairs,
  alignedPairs,
  targetsById,
  countryConfig,
  onOpenTargetPair,
}: {
  flaggedPairs: AlignmentResult[];
  alignedPairs: AlignmentResult[];
  targetsById: Map<string, Target>;
  countryConfig: CountryConfig | null;
  onOpenTargetPair: (
    pair: AlignmentResult,
    targetA: Target,
    targetB: Target,
  ) => void;
}) {
  const [showAligned, setShowAligned] = useState(false);
  const visible = showAligned
    ? [...flaggedPairs, ...alignedPairs]
    : flaggedPairs;
  return (
    <section className="border-t border-gray-200 pt-4">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <p className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)]">
          {showAligned
            ? `All target pairs (${(flaggedPairs.length + alignedPairs.length).toLocaleString()})`
            : `Flagged target pairs (${flaggedPairs.length.toLocaleString()})`}
        </p>
        {alignedPairs.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAligned((v) => !v)}
            className="text-[11px] text-[var(--undp-gray)] hover:text-[var(--undp-black)] underline"
          >
            {showAligned
              ? "Show flagged only"
              : `Show aligned (${alignedPairs.length.toLocaleString()})`}
          </button>
        )}
      </div>
      {visible.length === 0 ? (
        <p className="text-sm italic text-[var(--undp-gray)]">
          No target pairs to show.
        </p>
      ) : (
        <ol className="divide-y divide-gray-200 border-y border-gray-200">
          {visible.map((p) => {
            const tA = targetsById.get(p.targetAId);
            const tB = targetsById.get(p.targetBId);
            if (!tA || !tB) return null;
            return (
              <TargetPairRow
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
      )}
    </section>
  );
}

function TargetPairRow({
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
        className="w-full text-left py-2 px-2 hover:bg-gray-50 rounded transition-colors"
      >
        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
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
        </div>
        <p className="text-[10px] text-[var(--undp-gray)] mb-0.5">
          {docA} {targetA.sourceLabel} ↔ {docB} {targetB.sourceLabel}
        </p>
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
