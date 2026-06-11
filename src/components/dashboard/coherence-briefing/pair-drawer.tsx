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
import { useTranslations } from "next-intl";
import {
  ALIGNMENT_COLORS,
  getDocColor,
  getDocMediumLabel,
  getDocFullLabel,
} from "@/lib/utils";
import {
  useAlignmentLabels,
  useContradictionTypeLabels,
} from "@/lib/labels";
import { isContradiction } from "@/types";
import { FrictionDimensionChip, SubFieldChip } from "./theme-drawer";
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
  const t = useTranslations("briefing.drawer.pair");
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
        aria-label={t("closeAria")}
        onClick={onClose}
        className="absolute inset-0 bg-[var(--undp-black)]/40 backdrop-blur-sm"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={
          renderData.mode === "doc-pair"
            ? t("docPairDialogAria")
            : t("targetPairDialogAria")
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
            ← {t("backTo", {
              a: getDocMediumLabel(countryConfig, nested.parent.docPair.doc_a),
              b: getDocMediumLabel(countryConfig, nested.parent.docPair.doc_b),
            })}
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
  const t = useTranslations("briefing.drawer.pair");
  const alignmentLabels = useAlignmentLabels();
  const contradictionLabels = useContradictionTypeLabels();
  const color = ALIGNMENT_COLORS[pair.alignment];
  const contra = isContradiction(pair.alignment);
  return (
    <>
      <header className="sticky top-0 z-10 px-6 py-4 border-b border-gray-200 flex items-start justify-between gap-4 bg-white/90 backdrop-blur">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-1">
            {t("eyebrow.target")}
          </p>
          <h3
            className="text-xl text-[var(--undp-black)] font-medium leading-tight"
            style={{ fontFamily: HEADLINE_SERIF }}
          >
            {alignmentLabels[pair.alignment]}
            {pair.mechanism && (
              <span className="block text-xs font-normal text-[var(--undp-gray)] mt-1">
                {contradictionLabels[pair.mechanism]}
              </span>
            )}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("closeBtnAria")}
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
            {contra ? t("connector.flagged") : t("connector.aligned")}
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
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <p className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)]">
                {t("aiRationaleLabel")}
              </p>
              <FrictionDimensionChip
                mechanism={pair.mechanism}
                contestedResources={pair.contestedResources}
                sharedContext={pair.sharedContext}
              />
            </div>
            <p className="text-sm text-[var(--undp-black)] leading-relaxed italic">
              {pair.description}
            </p>
            <p className="mt-3 text-[10px] text-[var(--undp-gray)] leading-relaxed">
              {t("aiRationaleDisclaimer")}
            </p>
          </section>
        )}
      </div>
    </>
  );
}

/** The four country-reported BTR stages with localized labels; anything else
 *  renders raw (statuses are free text in the source data). */
const BTR_STATUS_KEYS = ["planned", "adopted", "ongoing", "implemented"];

function TargetCard({
  target,
  countryConfig,
  color,
}: {
  target: Target;
  countryConfig: CountryConfig | null;
  color: string;
}) {
  const t = useTranslations("briefing.drawer.pair");
  const tc = useTranslations("briefing.implementationCenter");
  const docLabel = getDocMediumLabel(countryConfig, target.sourceDocument);
  const docFull = getDocFullLabel(countryConfig, target.sourceDocument);
  // Reported-action stand-ins (Implementation drill-down) carry the reserved
  // "BTR" doc token, set both by the pipeline's pseudo-targets and by the
  // briefing's synthetic stand-ins; policy documents never use it. An explicit
  // field beats id-prefix sniffing, which would misfire on uploaded document
  // abbreviations (e.g. "ADP") or hand-curated action ids.
  const isReportedAction = target.sourceDocument === "BTR";
  const actionColor = getDocColor(countryConfig, "BTR");
  // The stand-in's sourceLabel carries the country-reported status; localize
  // the four known stages so the card matches the slide's status vocabulary.
  const statusKey = (target.sourceLabel ?? "").trim().toLowerCase();
  const actionStatusLabel = BTR_STATUS_KEYS.includes(statusKey)
    ? tc(`status.${statusKey}`)
    : target.sourceLabel;
  return (
    <div
      className="rounded-md border p-4"
      style={
        isReportedAction
          ? {
              // Visibly a different kind of card: tinted in the BTR colour,
              // never the plain white of a policy-target card.
              borderColor: `${actionColor}55`,
              backgroundColor: `${actionColor}0D`,
            }
          : { borderColor: "#e5e7eb", backgroundColor: "#ffffff" }
      }
    >
      <p
        className="text-[10px] uppercase tracking-wider font-medium mb-2"
        style={{ color: isReportedAction ? actionColor : color }}
      >
        {isReportedAction
          ? [t("reportedActionTag"), actionStatusLabel]
              .filter(Boolean)
              .join(" · ")
          : `${docLabel} · ${target.sourceLabel}`}
      </p>
      <p className="text-sm text-[var(--undp-black)] leading-relaxed">
        {target.text}
      </p>
      {(target.isQuantitative || target.isTimeBound) && (
        <p className="mt-2 text-[10px] text-[var(--undp-gray)] uppercase tracking-wider">
          {[
            target.isQuantitative ? t("badge.quantitative") : null,
            target.isTimeBound ? t("badge.timeBound") : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      <p className="mt-2 text-[10px] text-[var(--undp-gray)]">
        {t("sourceLabel", { name: docFull })}
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
  const t = useTranslations("briefing.drawer.pair");
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
              {t("eyebrow.doc")}
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
            aria-label={t("closeBtnAria")}
            className="text-[var(--undp-gray)] hover:text-[var(--undp-black)] text-2xl leading-none shrink-0"
          >
            ×
          </button>
        </div>
      </header>

      <div className="px-6 py-6 space-y-6">
        {!failed && (
          <>
            {/* Storylines are the headline content — each keeps its own box. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <StorylinePanel
                label={t("panel.aligned")}
                dotColor={ALIGNED_DOT_COLOR}
                body={docPair.synthesis.reinforce}
              />
              <StorylinePanel
                label={t("panel.flagged")}
                dotColor={FRICTION_DOT_COLOR}
                dashed
                body={docPair.synthesis.clash}
              />
            </div>
            {/* Supporting examples sit below the boxes as a plain, unboxed list. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ExamplesColumn
                variant="aligned"
                examples={alignedPairs}
                emptyText={t("emptyAligned")}
                totalCount={alignedPairs.length}
                targetsById={targetsById}
                countryConfig={countryConfig}
                onOpenTargetPair={onOpenTargetPair}
              />
              <ExamplesColumn
                variant="flagged"
                examples={flaggedPairs}
                emptyText={t("emptyFlagged")}
                totalCount={flaggedPairs.length}
                targetsById={targetsById}
                countryConfig={countryConfig}
                onOpenTargetPair={onOpenTargetPair}
              />
            </div>
          </>
        )}
        {!failed && docPair.synthesis.coordination_hint && (
          <div className="border-l-2 border-gray-300 pl-3">
            <p className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)] mb-1">
              {t("coordinationPathway")}
            </p>
            <p className="text-[13px] text-[var(--undp-black)] leading-relaxed italic">
              {docPair.synthesis.coordination_hint}
            </p>
          </div>
        )}
        <CountsStrip docPair={docPair} />
        <p className="text-[10px] text-[var(--undp-gray)] leading-relaxed">
          {t("aiDisclaimer")}
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

function StorylinePanel({
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

function ExamplesColumn({
  examples,
  emptyText,
  variant,
  targetsById,
  countryConfig,
  onOpenTargetPair,
  totalCount,
}: {
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
  const t = useTranslations("briefing.drawer.pair");
  const [expanded, setExpanded] = useState(false);
  const visible = expanded
    ? examples
    : examples.slice(0, EXAMPLES_DEFAULT_COUNT);
  const remaining = examples.length - EXAMPLES_DEFAULT_COUNT;
  const exampleHeader =
    variant === "flagged"
      ? examples.length !== totalCount
        ? t("examples.flaggedOfTotal", {
            count: examples.length,
            total: totalCount,
          })
        : t("examples.flagged", { count: examples.length })
      : t("examples.aligned", { count: examples.length });
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wider text-[var(--undp-gray)] mb-2.5">
        {exampleHeader}
      </p>
      {visible.length === 0 ? (
        <p className="text-[11px] italic text-[var(--undp-gray)]">
          {emptyText}
        </p>
      ) : (
        <ol className="divide-y divide-gray-200">
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
          {expanded ? t("showFewer") : t("showMore", { count: remaining })}
        </button>
      )}
    </div>
  );
}

function CountsStrip({ docPair }: { docPair: DocPairSynthesis }) {
  const t = useTranslations("briefing.drawer.pair");
  const contradictionLabels = useContradictionTypeLabels();
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
      `${contradictionLabels.goal_conflict.toLowerCase()} (${merged.goal_conflict.toLocaleString()})`,
    );
  }
  if (merged.resource_competition) {
    parts.push(
      `${contradictionLabels.resource_competition.toLowerCase()} (${merged.resource_competition.toLocaleString()})`,
    );
  }
  if (merged.delivery_friction) {
    parts.push(
      `${contradictionLabels.delivery_friction.toLowerCase()} (${merged.delivery_friction.toLocaleString()})`,
    );
  }
  return (
    <div className="border-t border-gray-200 pt-4">
      <p className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)] mb-2">
        {t("poolComposition")}
      </p>
      <p className="text-[15px] text-[var(--undp-black)] tabular-nums font-medium">
        <span style={{ color: ALIGNMENT_COLORS.high }}>
          {t("alignedCount", { count: docPair.aligned_count })}
        </span>
        <span className="text-[var(--undp-gray)] mx-2">·</span>
        <span style={{ color: ALIGNMENT_COLORS.flagged }}>
          {t("flaggedCount", { count: docPair.flagged_count })}
        </span>
      </p>
      {parts.length > 0 && (
        <p className="mt-1 text-[11px] text-[var(--undp-gray)] tabular-nums">
          {t("misalignmentTypes", { list: parts.join(", ") })}
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
  const t = useTranslations("briefing.drawer.pair");
  const [showAligned, setShowAligned] = useState(false);
  const visible = showAligned
    ? [...flaggedPairs, ...alignedPairs]
    : flaggedPairs;
  return (
    <section className="border-t border-gray-200 pt-4">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <p className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)]">
          {showAligned
            ? t("fallback.allPairs", {
                count: flaggedPairs.length + alignedPairs.length,
              })
            : t("fallback.flaggedOnly", { count: flaggedPairs.length })}
        </p>
        {alignedPairs.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAligned((v) => !v)}
            className="text-[11px] text-[var(--undp-gray)] hover:text-[var(--undp-black)] underline"
          >
            {showAligned
              ? t("fallback.showMisalignedOnly")
              : t("fallback.showAligned", { count: alignedPairs.length })}
          </button>
        )}
      </div>
      {visible.length === 0 ? (
        <p className="text-sm italic text-[var(--undp-gray)]">
          {t("fallback.empty")}
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
  const alignmentLabels = useAlignmentLabels();
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
            {alignmentLabels[pair.alignment]}
          </span>
          {isFlagged && pair.mechanism && (
            <SubFieldChip variant="mechanism" value={pair.mechanism} />
          )}
          <FrictionDimensionChip
            mechanism={pair.mechanism}
            contestedResources={pair.contestedResources}
            sharedContext={pair.sharedContext}
          />
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
