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

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { DrawerHeader } from "@/components/ui/drawer-shell";
import {
  ALIGNED_COLOR,
  ALIGNMENT_COLORS,
  FLAGGED_COLOR,
  MECHANISM_COLORS,
  getDocFullLabel,
  getDocMediumLabel,
} from "@/lib/utils";
import {
  useAlignmentLabels,
  useConfidenceLabels,
  useContradictionTypeLabels,
  useManageabilityLabels,
} from "@/lib/labels";
import {
  buildStorylineProfile,
  computeStorylineLiveStats,
  getDocPairKey,
  parseContributingDocPair,
  rankStorylines,
  type StorylineProfile,
} from "@/lib/coherence-briefing";
import { slugifyAnchorId } from "@/lib/feedback/anchor";
import { FeedbackControl } from "./feedback-control";
import type {
  AlignmentConfidence,
  AlignmentLevel,
  AlignmentManageability,
  AlignmentMechanism,
  AlignmentResult,
  CorpusStoryline,
  CountryConfig,
  Target,
  ThematicClassification,
} from "@/types";

const HEADLINE_SERIF = "var(--font-display)";

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
  /** Visible classifications; drive the "sectors touched" chips. */
  classifications: ThematicClassification[];
  /** Categories of the active taxonomy lens (localized names). */
  categories: { id: string; name: string }[];
  taxonomyType: string;
  /** Visible document count, for the driving-documents context line. */
  totalDocCount: number;
  /** Canonical country slug; enables the feedback control when present. */
  countryId?: string;
  /** Fired when the user picks one storyline from the all-storylines grid.
   *  The host pushes it onto the panel trail, so back returns to the grid. */
  onOpenSingleTheme?: (storyline: CorpusStoryline) => void;
  onOpenTargetPair: (
    pair: AlignmentResult,
    targetA: Target,
    targetB: Target,
  ) => void;
  /** Drill from a recurring target into its flag profile. */
  onOpenTargetProfile?: (target: Target) => void;
}

export function ThemeDrawer({
  theme,
  allStorylines,
  alignment,
  targetsById,
  countryConfig,
  classifications,
  categories,
  taxonomyType,
  totalDocCount,
  countryId,
  onOpenSingleTheme,
  onOpenTargetPair,
  onOpenTargetProfile,
}: ThemeDrawerProps) {
  const t = useTranslations("briefing.drawer.theme");

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

  // Live drill-down profile: driving documents, recurring targets
  // (anchor-pinned), sector chips. Everything recomputes from the visible
  // alignment, so counts track the document toggle exactly.
  const profile = useMemo<StorylineProfile | null>(() => {
    if (!theme) return null;
    return buildStorylineProfile({
      storyline: theme,
      alignment,
      targets: [...targetsById.values()],
      classifications,
      categories,
      taxonomyType,
    });
  }, [theme, alignment, targetsById, classifications, categories, taxonomyType]);

  if (!theme && allStorylines) {
    return (
      <AllStorylinesView
        storylines={allStorylines}
        alignment={alignment}
        targetsById={targetsById}
        onPick={(s) => onOpenSingleTheme?.(s)}
      />
    );
  }

  if (!theme || !profile) return null;

  const isReinforce = theme.type === "reinforcement";
  const dotColor = isReinforce ? ALIGNED_COLOR : FLAGGED_COLOR;
  const totalRecords = groups.reduce((s, g) => s + g.records.length, 0);
  const themeAnchor = slugifyAnchorId(theme.name);

  return (
    <>
      <DrawerHeader>
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
              <p className="text-caption font-medium text-[var(--undp-gray)]">
                {isReinforce
                  ? t("eyebrow.reinforce")
                  : t("eyebrow.friction")}
              </p>
            </div>
            <h3
              className="text-xl text-[var(--undp-black)] font-medium leading-snug"
              style={{ fontFamily: HEADLINE_SERIF }}
            >
              {theme.name}
            </h3>
            <p className="mt-1 text-caption text-[var(--undp-gray)] tabular-nums">
              {t(isReinforce ? "summary.reinforce" : "summary.friction", {
                docs: profile.byDoc.length,
                records: profile.liveCount,
              })}
            </p>
        </div>
      </DrawerHeader>

      <div className="px-6 py-6 space-y-6">
          <p className="text-body text-[var(--undp-black)] leading-relaxed">
            {theme.description}
          </p>

          {theme.pathway && (
            <section className="flex gap-2.5 border-l border-line-strong pl-3">
              <span
                aria-hidden="true"
                className="mt-px text-body leading-none text-[var(--undp-gray)]"
              >
                ↳
              </span>
              <div>
                <p className="text-caption font-medium text-[var(--undp-gray)] mb-1.5">
                  {t("pathwayHeading")}
                </p>
                <p className="text-data text-[var(--undp-black)] leading-relaxed">
                  {theme.pathway}
                </p>
                <p className="mt-1.5 text-caption text-[var(--undp-gray)] leading-relaxed">
                  {t("pathwayCaveat")}
                </p>
              </div>
            </section>
          )}

          {profile.byDoc.length > 0 && (
            <section>
              <p className="text-caption font-medium text-[var(--undp-gray)] mb-2">
                {t("drivingDocs", {
                  docs: profile.byDoc.length,
                  total: totalDocCount,
                })}
              </p>
              <ul className="space-y-1.5">
                {profile.byDoc.map((d) => (
                  <li key={d.doc}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className="text-caption text-[var(--undp-black)] truncate"
                        title={getDocFullLabel(countryConfig, d.doc)}
                      >
                        {getDocMediumLabel(countryConfig, d.doc)}
                      </span>
                      <span className="text-caption tabular-nums text-[var(--undp-gray)] shrink-0">
                        {d.count.toLocaleString()} ({Math.round(d.share * 100)}%)
                      </span>
                    </div>
                    <span
                      aria-hidden="true"
                      className="mt-0.5 block h-1 w-full rounded-full bg-gray-200"
                    >
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${Math.max(6, d.share * 100)}%`,
                          backgroundColor: "#94a3b8",
                        }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {profile.topTargets.length > 0 && (
            <section>
              <p className="text-caption font-medium text-[var(--undp-gray)] mb-2">
                {t("topTargets")}
              </p>
              <ol className="divide-y divide-line border-y border-line">
                {profile.topTargets.map(({ target, count }) => {
                  const inner = (
                    <>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-caption text-[var(--undp-gray)]">
                          {getDocMediumLabel(countryConfig, target.sourceDocument)}{" "}
                          {target.sourceLabel}
                        </span>
                        <span className="text-caption tabular-nums text-[var(--undp-gray)] shrink-0">
                          {t("topTargetCount", { count })}
                        </span>
                      </div>
                      <p
                        className="text-data text-[var(--undp-black)] leading-snug overflow-hidden"
                        style={{
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                        }}
                      >
                        {target.text}
                      </p>
                    </>
                  );
                  return (
                    <li key={target.id}>
                      {onOpenTargetProfile ? (
                        <button
                          type="button"
                          onClick={() => onOpenTargetProfile(target)}
                          className="w-full text-left py-2 px-1 hover:bg-gray-50 rounded transition-colors"
                        >
                          {inner}
                        </button>
                      ) : (
                        <div className="py-2 px-1">{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {profile.byTheme.length > 0 && (
            <section>
              <p className="text-caption font-medium text-[var(--undp-gray)] mb-2">
                {t("sectorsTouched")}
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {profile.byTheme.map((c) => (
                  <li
                    key={c.categoryId}
                    className="text-caption px-2 py-0.5 rounded-full border border-line-strong bg-white text-[var(--undp-gray)] tabular-nums"
                  >
                    {c.categoryName}{" "}
                    <span className="text-[var(--undp-gray)]/70">
                      {c.count.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <p className="text-caption font-medium text-[var(--undp-gray)] mb-3">
              {t("pairsInTheme")}
            </p>
            {groups.length === 0 || totalRecords === 0 ? (
              <p className="text-body text-[var(--undp-gray)]">
                {t("noConcretePairs")}
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

          <p className="text-caption text-[var(--undp-gray)] leading-relaxed">
            {t("aiDisclaimer")}
          </p>
        </div>
        {/* Sticky last child of the scrolling drawer (always visible).
            Storylines are LLM-named, so the anchor is the name slug: a
            renamed storyline starts fresh and the ledger keeps the old
            feedback. */}
        {themeAnchor && (
          <FeedbackControl
            variant="bar"
            countryId={countryId}
            surface="corpus_storyline"
            anchorIds={[themeAnchor]}
            contentText={theme.description}
            context={{
              storylineType: theme.type,
              confidence: theme.confidence,
            }}
          />
        )}
    </>
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
  const t = useTranslations("briefing.drawer.theme");
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
          className="text-data text-[var(--undp-black)] font-medium"
          title={`${fullA} ↔ ${fullB}`}
        >
          {labelA} ↔ {labelB}
        </p>
        <p className="text-caption text-[var(--undp-gray)] tabular-nums">
          {t("recordsCount", { count: group.records.length })}
        </p>
      </div>
      <ol className="divide-y divide-line border-y border-line">
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
          className="mt-2 text-caption text-[var(--undp-gray)] hover:text-[var(--undp-black)] underline underline-offset-2 tabular-nums"
        >
          {expanded
            ? t("showFewer")
            : t("showAllRecords", { count: group.records.length })}
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
        className="w-full text-left py-2.5 px-1 hover:bg-gray-50 rounded transition-colors"
      >
        <div className="flex items-center gap-2 mb-1 flex-wrap">
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
          <span className="text-caption text-[var(--undp-gray)]">
            {docA} {targetA.sourceLabel} ↔ {docB} {targetB.sourceLabel}
          </span>
        </div>
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
  const contradictionLabels = useContradictionTypeLabels();
  const manageabilityLabels = useManageabilityLabels();
  const confidenceLabels = useConfidenceLabels();
  if (variant === "mechanism") {
    // Colour per the friction-type palette (same as the bar) so the mechanism
    // reads as a warm severity ramp and is never confused with the neutral
    // slate manageability chip.
    const c = MECHANISM_COLORS[value as AlignmentMechanism];
    return (
      <span
        className="text-caption font-semibold px-1.5 py-0.5 rounded-full border"
        style={{
          color: c,
          borderColor: `${c}55`,
          backgroundColor: `${c}14`,
        }}
      >
        {contradictionLabels[value as AlignmentMechanism]}
      </span>
    );
  }
  if (variant === "manageability") {
    // Neutral slate for both values: the renamed labels describe WHERE the
    // friction sits (coordination-level vs design-level), not a verdict, so
    // the old red "fundamental" treatment would re-introduce the judgy tone.
    return (
      <span
        className="text-caption font-medium px-1.5 py-0.5 rounded-full border"
        style={{
          color: "#475569",
          borderColor: "#cbd5e1",
          backgroundColor: "#f1f5f9",
        }}
      >
        {manageabilityLabels[value as AlignmentManageability]}
      </span>
    );
  }
  // confidence
  const low = value === "low";
  return (
    <span
      className="text-caption font-medium px-1.5 py-0.5 rounded-full"
      style={{
        color: low ? "#92400e" : "#475569",
        backgroundColor: low ? "#fffbeb" : "#f1f5f9",
        border: low ? "1px dashed #f59e0b" : "1px solid #cbd5e1",
      }}
    >
      {confidenceLabels[value as AlignmentConfidence]}
    </span>
  );
}

/**
 * Plain-language label for the concrete dimension a flag concerns, derived from
 * the friction-dimensions fields (extract_friction_dimensions.py). Resource
 * competition names what the two targets compete for; delivery friction names
 * the shared place they act in. Returns null when the relevant field is empty,
 * so pairs without an extracted dimension simply show no chip.
 */
export function frictionDimensionLabel(
  mechanism: AlignmentMechanism | undefined,
  contestedResources: string[] | undefined,
  sharedContext: string | undefined,
): string | null {
  if (mechanism === "resource_competition" && contestedResources?.length) {
    return `Competes for: ${contestedResources.join(", ")}`;
  }
  if (mechanism === "delivery_friction" && sharedContext) {
    return `Shared area: ${sharedContext}`;
  }
  return null;
}

/**
 * Quiet, neutral chip for the friction dimension. Deliberately colourless
 * next to the mechanism/manageability chips: it carries content (a resource
 * or place) the analyst rationale named, not a category verdict.
 */
export function FrictionDimensionChip({
  mechanism,
  contestedResources,
  sharedContext,
}: {
  mechanism?: AlignmentMechanism;
  contestedResources?: string[];
  sharedContext?: string;
}) {
  const label = frictionDimensionLabel(mechanism, contestedResources, sharedContext);
  if (!label) return null;
  return (
    <span
      className="text-caption px-1.5 py-0.5 rounded-full border border-line-strong bg-white text-[var(--undp-gray)] whitespace-nowrap"
      title={label}
    >
      {label}
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
  alignment,
  targetsById,
  onPick,
}: {
  storylines: CorpusStoryline[];
  alignment: AlignmentResult[];
  targetsById: Map<string, Target>;
  onPick: (s: CorpusStoryline) => void;
}) {
  const t = useTranslations("briefing.drawer.theme");
  const liveStats = useMemo(
    () =>
      computeStorylineLiveStats(
        storylines,
        alignment,
        [...targetsById.values()],
      ),
    [storylines, alignment, targetsById],
  );
  const liveCountOf = (s: CorpusStoryline) =>
    liveStats.get(s)?.liveCount ?? 0;
  const reinforce = storylines.filter((s) => s.type === "reinforcement");
  const friction = storylines.filter((s) => s.type === "friction");
  return (
    <>
      <DrawerHeader>
        <p className="text-caption font-medium text-[var(--undp-gray)] mb-1.5">
          {t("all.eyebrow")}
        </p>
        <h3
          className="text-xl text-[var(--undp-black)] font-medium leading-snug"
          style={{ fontFamily: HEADLINE_SERIF }}
        >
          {t("all.heading", { count: storylines.length })}
        </h3>
        <p className="mt-1 text-caption text-[var(--undp-gray)] tabular-nums">
          {t("all.subtitle", {
            aligned: reinforce.length,
            flagged: friction.length,
          })}
        </p>
      </DrawerHeader>

      <div className="px-6 py-6 space-y-6">
          {reinforce.length > 0 && (
            <StorylineGroup
              label={t("eyebrow.reinforce")}
              tone="reinforce"
              storylines={reinforce}
              liveCountOf={liveCountOf}
              onPick={onPick}
            />
          )}
          {friction.length > 0 && (
            <StorylineGroup
              label={t("eyebrow.friction")}
              tone="friction"
              storylines={friction}
              liveCountOf={liveCountOf}
              onPick={onPick}
            />
          )}
        <p className="text-caption text-[var(--undp-gray)] leading-relaxed">
          {t("aiDisclaimer")}
        </p>
      </div>
    </>
  );
}

function StorylineGroup({
  label,
  tone,
  storylines,
  liveCountOf,
  onPick,
}: {
  label: string;
  tone: "reinforce" | "friction";
  storylines: CorpusStoryline[];
  liveCountOf: (s: CorpusStoryline) => number;
  onPick: (s: CorpusStoryline) => void;
}) {
  const t = useTranslations("briefing.drawer.theme");
  const dotColor = tone === "reinforce" ? ALIGNED_COLOR : FLAGGED_COLOR;
  // Shared ordering source: confidence rank, then live count, then name.
  const sorted = rankStorylines(
    storylines,
    tone === "reinforce" ? "reinforcement" : "friction",
    liveCountOf,
  );
  return (
    <section>
      <p className="text-caption font-medium text-[var(--undp-gray)] mb-2">
        {label}
      </p>
      <ul className="space-y-2">
        {sorted.map((s) => (
          <li key={s.name}>
            <button
              type="button"
              onClick={() => onPick(s)}
              className="w-full text-left rounded border border-line bg-white px-3 py-2.5 hover:border-line-strong transition-colors"
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
                  <p className="text-data font-medium text-[var(--undp-black)] leading-snug">
                    {s.name}
                  </p>
                  <p className="mt-1 text-caption text-[var(--undp-gray)] tabular-nums">
                    {t("storylineMeta", {
                      docs: s.spans_documents.length,
                      pairs: liveCountOf(s),
                      lowConf: s.confidence === "low" ? 1 : 0,
                    })}
                  </p>
                </div>
                <span
                  aria-hidden="true"
                  className="text-[var(--undp-gray)] text-caption mt-0.5"
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
