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
import type {
  AlignmentLevel,
  AlignmentResult,
  CountryConfig,
  DocPairSynthesis,
  Target,
} from "@/types";

const HEADLINE_SERIF =
  "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif";
const ALIGNED_DOT_COLOR = "#196127";
const FRICTION_DOT_COLOR = "#dc2626";
const AI_DISCLAIMER =
  "AI-generated synthesis. Treat as a prompt to review, not a settled finding.";

const SEVERITY_RANK: Record<AlignmentLevel, number> = {
  likely_conflict: 0,
  possible_conflict: 1,
  possible_misalignment: 2,
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
            {pair.contradictionType && (
              <span className="block text-xs font-normal text-[var(--undp-gray)] mt-1">
                {CONTRADICTION_TYPE_LABELS[pair.contradictionType]}
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

  // Separate flagged from aligned for the default flagged-only view.
  const { flaggedPairs, alignedPairs } = useMemo(() => {
    const flagged: AlignmentResult[] = [];
    const aligned: AlignmentResult[] = [];
    for (const p of pairs) {
      if (p.alignment === "none") continue;
      if (isContradiction(p.alignment)) flagged.push(p);
      else aligned.push(p);
    }
    flagged.sort((x, y) => SEVERITY_RANK[x.alignment] - SEVERITY_RANK[y.alignment]);
    aligned.sort((x, y) => SEVERITY_RANK[x.alignment] - SEVERITY_RANK[y.alignment]);
    return { flaggedPairs: flagged, alignedPairs: aligned };
  }, [pairs]);

  const [showAligned, setShowAligned] = useState(false);

  const failed = docPair.synthesis_error !== null;

  return (
    <>
      <header className="sticky top-0 z-10 px-6 py-4 border-b border-gray-200 flex items-start justify-between gap-4 bg-white/90 backdrop-blur">
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
      </header>

      <div className="px-6 py-6 space-y-6">
        {!failed && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SynthesisPanel
              label="Reinforces"
              dotColor={ALIGNED_DOT_COLOR}
              body={docPair.synthesis.reinforce}
            />
            <SynthesisPanel
              label="Flagged for review"
              dotColor={FRICTION_DOT_COLOR}
              dashed
              body={docPair.synthesis.clash}
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

        <TargetPairList
          flaggedPairs={flaggedPairs}
          alignedPairs={alignedPairs}
          showAligned={showAligned}
          onToggleAligned={() => setShowAligned((v) => !v)}
          targetsById={targetsById}
          countryConfig={countryConfig}
          onOpenTargetPair={onOpenTargetPair}
        />
      </div>
    </>
  );
}

function SynthesisPanel({
  label,
  dotColor,
  dashed,
  body,
}: {
  label: string;
  dotColor: string;
  dashed?: boolean;
  body: string;
}) {
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
      <p className="text-[13px] text-[var(--undp-black)] leading-relaxed">
        {body}
      </p>
    </div>
  );
}

function CountsStrip({ docPair }: { docPair: DocPairSynthesis }) {
  const parts: string[] = [];
  if (docPair.contradiction_types.implementation_tension) {
    parts.push(
      `implementation tension (${docPair.contradiction_types.implementation_tension.toLocaleString()})`,
    );
  }
  if (docPair.contradiction_types.resource_competition) {
    parts.push(
      `resource competition (${docPair.contradiction_types.resource_competition.toLocaleString()})`,
    );
  }
  if (docPair.contradiction_types.goal_conflict) {
    parts.push(
      `goal conflict (${docPair.contradiction_types.goal_conflict.toLocaleString()})`,
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
        <span style={{ color: ALIGNMENT_COLORS.possible_conflict }}>
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

function TargetPairList({
  flaggedPairs,
  alignedPairs,
  showAligned,
  onToggleAligned,
  targetsById,
  countryConfig,
  onOpenTargetPair,
}: {
  flaggedPairs: AlignmentResult[];
  alignedPairs: AlignmentResult[];
  showAligned: boolean;
  onToggleAligned: () => void;
  targetsById: Map<string, Target>;
  countryConfig: CountryConfig | null;
  onOpenTargetPair: (
    pair: AlignmentResult,
    targetA: Target,
    targetB: Target,
  ) => void;
}) {
  const visible = showAligned
    ? [...flaggedPairs, ...alignedPairs]
    : flaggedPairs;
  return (
    <section className="border-t border-gray-200 pt-4">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <p className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)]">
          {showAligned
            ? `Target pairs (${(flaggedPairs.length + alignedPairs.length).toLocaleString()})`
            : `Flagged target pairs (${flaggedPairs.length.toLocaleString()})`}
        </p>
        {alignedPairs.length > 0 && (
          <button
            type="button"
            onClick={onToggleAligned}
            className="text-[11px] text-[var(--undp-gray)] hover:text-[var(--undp-black)] underline"
          >
            {showAligned
              ? `Show flagged only`
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
          <span className="text-[10px] text-[var(--undp-gray)]">
            {docA} {targetA.sourceLabel} ↔ {docB} {targetB.sourceLabel}
          </span>
        </div>
        {pair.description && (
          <p
            className="text-[12px] text-[var(--undp-black)] leading-snug italic overflow-hidden"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 1,
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
