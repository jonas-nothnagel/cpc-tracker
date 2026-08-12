"use client";

/**
 * PairDrawer — panel body for either a single target-pair (clicked from a
 * fault-line row or wheel chord) or a whole doc-pair (clicked from Section 3
 * ranking). One discriminated union, two bodies.
 *
 * Doc-pair mode shows the LLM synthesis (reinforce + clash + coordination
 * hint), a prominent counts strip, and a flagged-only list of target-pairs
 * with a "Show aligned" expand. Clicking a target-pair row drills into
 * target-pair mode; the panel trail supplies the way back.
 *
 * Target-pair mode renders the two-target card view + AI rationale.
 *
 * The surrounding chrome (scrim, dialog, Escape and back keys, scroll lock,
 * focus trap, close button) belongs to DrawerShell; this file renders a
 * DrawerHeader and a body.
 */

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ALIGNED_COLOR,
  ALIGNMENT_COLORS,
  FLAGGED_COLOR,
  getDocColor,
  getDocMediumLabel,
  getDocFullLabel,
} from "@/lib/utils";
import {
  useAlignmentLabels,
  useContradictionTypeLabels,
} from "@/lib/labels";
import { DrawerHeader } from "@/components/ui/drawer-shell";
import { isContradiction } from "@/types";
import { FeedbackControl } from "./feedback-control";
import { FrictionDimensionChip, SubFieldChip } from "./theme-drawer";
import { DefinitionChip } from "./target-quality";
import type {
  AlignmentConfidence,
  AlignmentLevel,
  AlignmentResult,
  CountryConfig,
  DocPairSynthesis,
  Target,
} from "@/types";

const EXAMPLES_DEFAULT_COUNT = 3;

const HEADLINE_SERIF = "var(--font-display)";

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
  countryId,
  onOpenTargetPair,
}: {
  data: PairDrawerData;
  countryConfig: CountryConfig | null;
  /** Canonical country slug; enables the feedback control when present. */
  countryId?: string;
  /** Drill from a doc-pair example row into that single target-pair. */
  onOpenTargetPair: (aId: string, bId: string) => void;
}) {
  return data.mode === "target-pair" ? (
    <TargetPairBody
      pair={data.pair}
      targetA={data.targetA}
      targetB={data.targetB}
      countryConfig={countryConfig}
      countryId={countryId}
    />
  ) : (
    <DocPairBody
      docPair={data.docPair}
      pairs={data.pairs}
      targetsById={data.targetsById}
      countryConfig={countryConfig}
      countryId={countryId}
      onOpenTargetPair={onOpenTargetPair}
    />
  );
}

// ─── Target-pair body (existing layout) ────────────────────────────

function TargetPairBody({
  pair,
  targetA,
  targetB,
  countryConfig,
  countryId,
}: {
  pair: AlignmentResult;
  targetA: Target;
  targetB: Target;
  countryConfig: CountryConfig | null;
  countryId?: string;
}) {
  const t = useTranslations("briefing.drawer.pair");
  const alignmentLabels = useAlignmentLabels();
  const contradictionLabels = useContradictionTypeLabels();
  const color = ALIGNMENT_COLORS[pair.alignment];
  const contra = isContradiction(pair.alignment);
  return (
    <>
      <DrawerHeader>
        <p className="text-caption font-medium text-[var(--undp-gray)] mb-1">
          {t("eyebrow.target")}
        </p>
        <h3
          className="text-xl text-[var(--undp-black)] font-medium leading-tight"
          style={{ fontFamily: HEADLINE_SERIF }}
        >
          {alignmentLabels[pair.alignment]}
          {pair.mechanism && (
            <span className="block text-data font-sans font-normal text-[var(--undp-gray)] mt-1">
              {contradictionLabels[pair.mechanism]}
            </span>
          )}
        </h3>
      </DrawerHeader>

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
            className="text-caption font-medium"
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
          <section className="border-t border-line pt-4">
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <p className="text-caption font-medium text-[var(--undp-gray)]">
                {t("aiRationaleLabel")}
              </p>
              <FrictionDimensionChip
                mechanism={pair.mechanism}
                contestedResources={pair.contestedResources}
                sharedContext={pair.sharedContext}
              />
            </div>
            <p className="text-body text-[var(--undp-black)] leading-relaxed">
              {pair.description}
            </p>
            {/* Say why this one paragraph is in English on an otherwise
                translated page. Only ever set when a translation pass has run
                and did not cover this pair, so a fully-English page shows
                nothing here. */}
            {pair.descriptionTranslationPending && (
              <p className="mt-2 text-caption text-[var(--undp-gray)] italic leading-relaxed">
                {t("rationaleTranslationPending")}
              </p>
            )}
            <p className="mt-3 text-caption text-[var(--undp-gray)] leading-relaxed">
              {t("aiRationaleDisclaimer")}
            </p>
          </section>
        )}
      </div>
      {/* Sticky last child of the scrolling drawer so the control is
          visible without scrolling (user testing: below the fold it was
          missed). */}
      {pair.description && (
        <FeedbackControl
          variant="bar"
          countryId={countryId}
          surface="target_pair_rationale"
          anchorIds={[pair.targetAId, pair.targetBId]}
          contentText={pair.description}
          context={{
            alignment: pair.alignment,
            mechanism: pair.mechanism,
            confidence: pair.confidence,
            manageability: pair.manageability,
          }}
        />
      )}
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
  // Reported-action and budget-line stand-ins carry reserved doc tokens ("BTR"
  // / "BER"), set both by the pipeline's pseudo-targets and by the briefing's
  // synthetic stand-ins; policy documents never use them. An explicit field
  // beats id-prefix sniffing, which would misfire on uploaded document
  // abbreviations (e.g. "ADP") or hand-curated action ids.
  const isReportedAction = target.sourceDocument === "BTR";
  const isBudgetLine = target.sourceDocument === "BER";
  const isStandIn = isReportedAction || isBudgetLine;
  const standInColor = getDocColor(countryConfig, target.sourceDocument);
  // The reported-action stand-in's sourceLabel carries the country-reported
  // status; localize the four known stages so the card matches the slide's
  // status vocabulary. The budget-line stand-in's sourceLabel is its code.
  const statusKey = (target.sourceLabel ?? "").trim().toLowerCase();
  const actionStatusLabel = BTR_STATUS_KEYS.includes(statusKey)
    ? tc(`status.${statusKey}`)
    : target.sourceLabel;
  const tagLine = isReportedAction
    ? [t("reportedActionTag"), actionStatusLabel].filter(Boolean).join(" · ")
    : isBudgetLine
      ? [t("budgetLineTag"), target.sourceLabel].filter(Boolean).join(" · ")
      : `${docLabel} · ${target.sourceLabel}`;
  return (
    <div
      className="rounded-md border p-4"
      style={
        isStandIn
          ? {
              // Visibly a different kind of card: tinted in the stand-in's
              // (BTR / BER) colour, never the plain white of a policy card.
              borderColor: `${standInColor}55`,
              backgroundColor: `${standInColor}0D`,
            }
          : { borderColor: "var(--color-line)", backgroundColor: "#ffffff" }
      }
    >
      <p
        className="text-caption font-medium mb-2"
        style={{ color: isStandIn ? standInColor : color }}
      >
        {tagLine}
      </p>
      <p className="text-body text-[var(--undp-black)] leading-relaxed">
        {target.text}
      </p>
      {/* The elements chip already reports measurable and deadline among its
          five, so it replaces the two badges rather than sitting beside them.
          Stand-ins (BTR / BER) and countries with no target_quality.json carry
          no `definition`, so they keep the badges they have always had. */}
      {target.definition?.elements ? (
        <span className="mt-2 block">
          <DefinitionChip target={target} />
        </span>
      ) : (
        (target.isQuantitative || target.isTimeBound) && (
          <p className="mt-2 text-caption font-medium text-[var(--undp-gray)]">
            {[
              target.isQuantitative ? t("badge.quantitative") : null,
              target.isTimeBound ? t("badge.timeBound") : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )
      )}
      <p className="mt-2 text-caption text-[var(--undp-gray)]">
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
  countryId,
  onOpenTargetPair,
}: {
  docPair: DocPairSynthesis;
  pairs: AlignmentResult[];
  targetsById: Map<string, Target>;
  countryConfig: CountryConfig | null;
  countryId?: string;
  onOpenTargetPair: (aId: string, bId: string) => void;
}) {
  const t = useTranslations("briefing.drawer.pair");
  const labelAFull = getDocFullLabel(countryConfig, docPair.doc_a);
  const labelBFull = getDocFullLabel(countryConfig, docPair.doc_b);
  // The example rows carry the resolved targets; the panel trail only needs
  // their ids, in the order the row displayed them.
  const openRow = useCallback(
    (_pair: AlignmentResult, targetA: Target, targetB: Target) =>
      onOpenTargetPair(targetA.id, targetB.id),
    [onOpenTargetPair],
  );

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
      <DrawerHeader>
        <p className="text-caption font-medium text-[var(--undp-gray)] mb-1">
          {t("eyebrow.doc")}
        </p>
        <h3
          className="text-xl text-[var(--undp-black)] font-medium leading-tight truncate"
          style={{ fontFamily: HEADLINE_SERIF }}
        >
          {labelAFull} ↔ {labelBFull}
        </h3>
        {!failed && (
          <p className="mt-1 text-data text-[var(--undp-gray)] leading-snug">
            {docPair.synthesis.storyline_name}
          </p>
        )}
      </DrawerHeader>

      <div className="px-6 py-6 space-y-6">
        {!failed && (
          <>
            {/* Storylines are the headline content — each keeps its own box. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <StorylinePanel
                label={t("panel.aligned")}
                dotColor={ALIGNED_COLOR}
                body={docPair.synthesis.reinforce}
              />
              <StorylinePanel
                label={t("panel.flagged")}
                dotColor={FLAGGED_COLOR}
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
                onOpenTargetPair={openRow}
              />
              <ExamplesColumn
                variant="flagged"
                examples={flaggedPairs}
                emptyText={t("emptyFlagged")}
                totalCount={flaggedPairs.length}
                targetsById={targetsById}
                countryConfig={countryConfig}
                onOpenTargetPair={openRow}
              />
            </div>
          </>
        )}
        {!failed && docPair.synthesis.coordination_hint && (
          <div className="border-l border-line-strong pl-3">
            <p className="text-caption font-medium text-[var(--undp-gray)] mb-1">
              {t("coordinationPathway")}
            </p>
            <p className="text-data text-[var(--undp-black)] leading-relaxed">
              {docPair.synthesis.coordination_hint}
            </p>
          </div>
        )}
        <CountsStrip docPair={docPair} />
        <p className="text-caption text-[var(--undp-gray)] leading-relaxed">
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
            onOpenTargetPair={openRow}
          />
        )}
      </div>
      {/* Sticky last child of the scrolling drawer (always visible). One
          control for the whole synthesis: the panels are a single LLM
          output and a single verdict to rate. */}
      {!failed && (
        <FeedbackControl
          variant="bar"
          countryId={countryId}
          surface="doc_pair_synthesis"
          anchorIds={[docPair.doc_a, docPair.doc_b]}
          contentText={[
            docPair.synthesis.storyline_name,
            docPair.synthesis.reinforce,
            docPair.synthesis.clash,
            docPair.synthesis.coordination_hint,
          ].join("\n")}
          context={{ synthesisConfidence: docPair.synthesis.confidence }}
        />
      )}
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
    <div className="rounded-md border border-line bg-white p-4">
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
        <p className="text-caption font-medium text-[var(--undp-black)]">
          {label}
        </p>
      </div>
      <p className="text-data text-[var(--undp-black)] leading-relaxed">
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
      <p className="text-caption font-medium text-[var(--undp-gray)] mb-2.5">
        {exampleHeader}
      </p>
      {visible.length === 0 ? (
        <p className="text-caption text-[var(--undp-gray)]">
          {emptyText}
        </p>
      ) : (
        <ol className="divide-y divide-line">
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
          className="mt-2 text-caption text-[var(--undp-gray)] hover:text-[var(--undp-black)] underline underline-offset-2 tabular-nums"
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
    <div className="border-t border-line pt-4">
      <p className="text-caption font-medium text-[var(--undp-gray)] mb-2">
        {t("poolComposition")}
      </p>
      <p className="text-body text-[var(--undp-black)] tabular-nums font-medium">
        <span style={{ color: ALIGNMENT_COLORS.high }}>
          {t("alignedCount", { count: docPair.aligned_count })}
        </span>
        <span className="text-[var(--undp-gray)] mx-2">·</span>
        <span style={{ color: ALIGNMENT_COLORS.flagged }}>
          {t("flaggedCount", { count: docPair.flagged_count })}
        </span>
      </p>
      {parts.length > 0 && (
        <p className="mt-1 text-caption text-[var(--undp-gray)] tabular-nums">
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
    <section className="border-t border-line pt-4">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <p className="text-caption font-medium text-[var(--undp-gray)]">
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
            className="text-caption text-[var(--undp-gray)] hover:text-[var(--undp-black)] underline underline-offset-2 tabular-nums"
          >
            {showAligned
              ? t("fallback.showMisalignedOnly")
              : t("fallback.showAligned", { count: alignedPairs.length })}
          </button>
        )}
      </div>
      {visible.length === 0 ? (
        <p className="text-body text-[var(--undp-gray)]">
          {t("fallback.empty")}
        </p>
      ) : (
        <ol className="divide-y divide-line border-y border-line">
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
            className="text-caption font-semibold px-1.5 py-0.5 rounded-full"
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
        <p className="text-caption text-[var(--undp-gray)] mb-0.5">
          {docA} {targetA.sourceLabel} ↔ {docB} {targetB.sourceLabel}
        </p>
        {pair.description && (
          <p
            className="text-caption text-[var(--undp-black)] leading-snug overflow-hidden"
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
