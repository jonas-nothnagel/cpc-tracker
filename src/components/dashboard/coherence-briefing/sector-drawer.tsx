"use client";

/**
 * SectorDrawer — opens when the user clicks a sector tile.
 *
 * Round-2 restructure: instead of a synthesis block at the top and
 * separate "top alignments / top tensions" lists below, each synthesis
 * panel (Aligned / Potential misalignment) now carries its own example
 * sub-list directly beneath the LLM text. Single source of truth, the
 * examples are anchored to the claims they support.
 *
 * Per v2.1 audit: every flagged example row surfaces the new
 * sub-fields (mechanism / manageability / confidence). A confidence
 * filter chip in the drawer header lets reviewers drop low-confidence
 * flagged rows (which are 2-3× more likely to be false positives).
 * The pool composition counts at the bottom stay unfiltered — the
 * filter is a review affordance, not a data revision.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ALIGNMENT_COLORS, getDocMediumLabel } from "@/lib/utils";
import {
  useAlignmentLabels,
  useContradictionTypeLabels,
  useManageabilityLabels,
} from "@/lib/labels";
import type { FaultLine, SectorBriefing } from "@/lib/coherence-briefing";
import type {
  AlignmentResult,
  CountryConfig,
  SectorSynthesis,
  Target,
} from "@/types";

const HEADLINE_SERIF =
  "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif";
const ALIGNED_DOT_COLOR = "#196127";
const FRICTION_DOT_COLOR = "#dc2626";
const EXAMPLES_DEFAULT_COUNT = 3;

export function SectorDrawer({
  briefing,
  sectorSynthesis,
  countryConfig,
  onClose,
  onOpenTargetPair,
}: {
  briefing: SectorBriefing | null;
  sectorSynthesis: SectorSynthesis | null;
  countryConfig: CountryConfig | null;
  onClose: () => void;
  onOpenTargetPair?: (
    pair: AlignmentResult,
    targetA: Target,
    targetB: Target,
  ) => void;
}) {
  const t = useTranslations("briefing.drawer.sector");
  useEffect(() => {
    if (!briefing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [briefing, onClose]);

  useEffect(() => {
    if (!briefing) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [briefing]);

  if (!briefing) return null;

  // Sector header sentence, localized (replaces the old lib-composed English).
  const hub = briefing.recurringHub;
  const synthesisSentence =
    briefing.flaggedCount === 0
      ? briefing.targetCount === 0
        ? t("synthesis.empty", { categoryName: briefing.categoryName })
        : t("synthesis.noFlags", { categoryName: briefing.categoryName })
      : hub && hub.flaggedPairCount >= 2
        ? t("synthesis.hub", {
            count: briefing.flaggedCount,
            categoryName: briefing.categoryName,
            hubCount: hub.flaggedPairCount,
            pct: Math.round(
              (hub.flaggedPairCount / briefing.flaggedCount) * 100,
            ),
          })
        : t("synthesis.spread", {
            count: briefing.flaggedCount,
            categoryName: briefing.categoryName,
          });

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
        aria-label={t("dialogAria", { name: briefing.categoryName })}
        className="relative h-full w-full sm:w-[560px] md:w-[640px] bg-white shadow-2xl overflow-y-auto"
        style={{ backgroundColor: "#fbfaf7" }}
      >
        <header className="sticky top-0 z-10 px-6 py-4 border-b border-gray-200 bg-white/90 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-1">
                {t("eyebrow")}
              </p>
              <h3
                className="text-xl text-[var(--undp-black)] font-medium leading-tight"
                style={{ fontFamily: HEADLINE_SERIF }}
              >
                {briefing.categoryName}
              </h3>
              <p className="mt-1 text-xs text-[var(--undp-gray)]">
                {t("headerCounts", { targets: briefing.targetCount, pairs: briefing.signalCount })}
              </p>
              <p className="mt-3 text-[13px] leading-snug text-[var(--undp-black)]">
                {synthesisSentence}
              </p>
              {briefing.recurringHub &&
                briefing.recurringHub.flaggedPairCount >= 2 && (
                  <p className="mt-2 text-[11px] text-[var(--undp-gray)] line-clamp-3">
                    <span className="uppercase tracking-wider text-[9px] font-semibold mr-1">
                      {t("recursLabel")}
                    </span>
                    {briefing.recurringHub.target.sourceLabel} ·{" "}
                    {briefing.recurringHub.target.text}
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

        <div className="px-6 py-6 space-y-8">
          {sectorSynthesis ? (
            <SectorSynthesisBlock
              synthesis={sectorSynthesis}
              topAlignments={briefing.topAlignments}
              topTensions={briefing.topTensions}
              countryConfig={countryConfig}
              onOpenTargetPair={onOpenTargetPair}
            />
          ) : (
            // Fallback when synthesis is unavailable: legacy two-list view.
            <>
              <LegacyDrawerList
                heading={t("legacy.pullingTogether")}
                empty={t("emptyAligned")}
                entries={briefing.topAlignments}
                countryConfig={countryConfig}
                onOpenTargetPair={onOpenTargetPair}
              />
              <LegacyDrawerList
                heading={t("legacy.pullingAgainst")}
                empty={t("emptyFlagged")}
                entries={briefing.topTensions}
                countryConfig={countryConfig}
                onOpenTargetPair={onOpenTargetPair}
              />
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function SectorSynthesisBlock({
  synthesis,
  topAlignments,
  topTensions,
  countryConfig,
  onOpenTargetPair,
}: {
  synthesis: SectorSynthesis;
  topAlignments: FaultLine[];
  topTensions: FaultLine[];
  countryConfig: CountryConfig | null;
  onOpenTargetPair?: (
    pair: AlignmentResult,
    targetA: Target,
    targetB: Target,
  ) => void;
}) {
  const t = useTranslations("briefing.drawer.sector");
  const contradictionLabels = useContradictionTypeLabels();
  if (synthesis.synthesis_error !== null) {
    return (
      <section className="rounded-md border border-gray-200 bg-white p-4">
        <p className="text-xs italic text-[var(--undp-gray)]">
          {t("synthesisFailed")}
        </p>
        <div className="mt-4 space-y-6">
          <LegacyDrawerList
            heading={t("legacy.strongestAlignments")}
            empty={t("emptyAligned")}
            entries={topAlignments}
            countryConfig={countryConfig}
            onOpenTargetPair={onOpenTargetPair}
          />
          <LegacyDrawerList
            heading={t("legacy.topFlagged")}
            empty={t("emptyFlagged")}
            entries={topTensions}
            countryConfig={countryConfig}
            onOpenTargetPair={onOpenTargetPair}
          />
        </div>
      </section>
    );
  }
  const { storyline_name, reinforce, clash, coordination_hint } =
    synthesis.synthesis;
  const total =
    synthesis.pool_composition.primary_count +
    synthesis.pool_composition.relevant_only_count;
  const subtypeParts = renderContradictionSubtypes(synthesis, contradictionLabels);
  return (
    <section className="space-y-5">
      <p
        className="text-[15px] text-[var(--undp-black)] leading-snug"
        style={{ fontFamily: HEADLINE_SERIF }}
      >
        {storyline_name}
      </p>
      {/* Storylines are the headline content — each keeps its own box. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StorylinePanel
          label={t("panel.aligned")}
          dotColor={ALIGNED_DOT_COLOR}
          body={reinforce}
        />
        <StorylinePanel
          label={t("panel.flagged")}
          dotColor={FRICTION_DOT_COLOR}
          dashed
          body={clash}
        />
      </div>
      {/* Supporting examples sit below the boxes as a plain, unboxed list. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ExamplesColumn
          variant="aligned"
          examples={topAlignments}
          emptyText={t("emptyAligned")}
          countryConfig={countryConfig}
          onOpenTargetPair={onOpenTargetPair}
        />
        <ExamplesColumn
          variant="flagged"
          examples={topTensions}
          emptyText={t("emptyFlagged")}
          countryConfig={countryConfig}
          onOpenTargetPair={onOpenTargetPair}
        />
      </div>
      {coordination_hint && (
        <div className="border-l-2 border-gray-300 pl-3">
          <p className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)] mb-1">
            {t("coordinationPathway")}
          </p>
          <p className="text-[13px] text-[var(--undp-black)] leading-relaxed italic">
            {coordination_hint}
          </p>
        </div>
      )}
      <div className="border-t border-gray-200 pt-4">
        <p className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)] mb-2">
          {t("poolComposition")}
        </p>
        <p className="text-[14px] text-[var(--undp-black)] tabular-nums font-medium">
          <span style={{ color: ALIGNMENT_COLORS.high }}>
            {t("alignedCount", { count: synthesis.aligned_count })}
          </span>
          <span className="text-[var(--undp-gray)] mx-2">·</span>
          <span style={{ color: ALIGNMENT_COLORS.flagged }}>
            {t("flaggedCount", { count: synthesis.flagged_count })}
          </span>
        </p>
        <p className="mt-1 text-[11px] text-[var(--undp-gray)] tabular-nums">
          {t("synthesisedFrom", {
            count: total,
            primary: synthesis.pool_composition.primary_count,
            relevant: synthesis.pool_composition.relevant_only_count,
          })}
        </p>
        {subtypeParts.length > 0 && (
          <p className="mt-1 text-[11px] text-[var(--undp-gray)] tabular-nums">
            {t("misalignmentTypes", { list: subtypeParts.join(", ") })}
          </p>
        )}
      </div>
      <p className="text-[10px] text-[var(--undp-gray)] leading-relaxed">
        {t("aiDisclaimer")}
      </p>
    </section>
  );
}

function renderContradictionSubtypes(
  synthesis: SectorSynthesis,
  labels: Record<"goal_conflict" | "resource_competition" | "delivery_friction", string>,
): string[] {
  const ct = synthesis.contradiction_types;
  const parts: string[] = [];
  // v2.1 canonical first, with v1 legacy keys folded in so older
  // synthesis JSON still surfaces something sensible.
  const merged = {
    goal_conflict: ct.goal_conflict ?? 0,
    resource_competition: ct.resource_competition ?? 0,
    delivery_friction:
      (ct.delivery_friction ?? 0) +
      (ct.implementation_tension ?? 0) +
      (ct.scale_scope_mismatch ?? 0),
  };
  if (merged.goal_conflict) {
    parts.push(
      `${labels.goal_conflict.toLowerCase()} (${merged.goal_conflict.toLocaleString()})`,
    );
  }
  if (merged.resource_competition) {
    parts.push(
      `${labels.resource_competition.toLowerCase()} (${merged.resource_competition.toLocaleString()})`,
    );
  }
  if (merged.delivery_friction) {
    parts.push(
      `${labels.delivery_friction.toLowerCase()} (${merged.delivery_friction.toLocaleString()})`,
    );
  }
  return parts;
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
    <div className="rounded-md border border-gray-200 bg-white p-3">
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
      <p className="text-[12px] text-[var(--undp-black)] leading-relaxed">
        {body}
      </p>
    </div>
  );
}

function ExamplesColumn({
  examples,
  emptyText,
  variant,
  countryConfig,
  onOpenTargetPair,
}: {
  examples: FaultLine[];
  emptyText: string;
  variant: "aligned" | "flagged";
  countryConfig: CountryConfig | null;
  onOpenTargetPair?: (
    pair: AlignmentResult,
    targetA: Target,
    targetB: Target,
  ) => void;
}) {
  const t = useTranslations("briefing.drawer.sector");
  const [expanded, setExpanded] = useState(false);
  const visible = expanded
    ? examples
    : examples.slice(0, EXAMPLES_DEFAULT_COUNT);
  const remaining = examples.length - EXAMPLES_DEFAULT_COUNT;
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wider text-[var(--undp-gray)] mb-2.5">
        {variant === "flagged"
          ? t("examples.flagged")
          : t("examples.aligned")}
      </p>
      {visible.length === 0 ? (
        <p className="text-[11px] italic text-[var(--undp-gray)]">
          {emptyText}
        </p>
      ) : (
        <ol className="divide-y divide-gray-200">
          {visible.map((line) => (
            <ExampleRow
              key={`${line.pair.targetAId}__${line.pair.targetBId}`}
              line={line}
              countryConfig={countryConfig}
              onOpen={
                onOpenTargetPair
                  ? () =>
                      onOpenTargetPair(line.pair, line.targetA, line.targetB)
                  : undefined
              }
            />
          ))}
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

function ExampleRow({
  line,
  countryConfig,
  onOpen,
}: {
  line: FaultLine;
  countryConfig: CountryConfig | null;
  onOpen?: () => void;
}) {
  const alignmentLabels = useAlignmentLabels();
  const mechanismLabels = useContradictionTypeLabels();
  const manageabilityLabels = useManageabilityLabels();
  const { targetA, targetB, pair } = line;
  const color = ALIGNMENT_COLORS[pair.alignment];
  const docA = getDocMediumLabel(countryConfig, targetA.sourceDocument);
  const docB = getDocMediumLabel(countryConfig, targetB.sourceDocument);
  const isFlagged = pair.alignment === "flagged";
  // Mechanism + manageability are facets OF the potential-misalignment
  // classification, not sibling tags. The alignment label is the lead pill;
  // these hang beneath it as subordinate sub-text so the hierarchy reads at a
  // glance (rather than three equal pills in three competing colours).
  const facets = isFlagged
    ? [
        pair.mechanism ? mechanismLabels[pair.mechanism] : null,
        pair.manageability ? manageabilityLabels[pair.manageability] : null,
      ].filter((v): v is string => Boolean(v))
    : [];
  const Tag = onOpen ? "button" : "div";
  return (
    <li>
      <Tag
        type={onOpen ? "button" : undefined}
        onClick={onOpen}
        className={`w-full text-left rounded ${
          onOpen ? "hover:bg-gray-50 transition-colors" : ""
        } p-2`}
      >
        <div className="mb-1">
          <span
            className="inline-block text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full"
            style={{
              backgroundColor: `${color}20`,
              color,
              border: `1px solid ${color}40`,
            }}
          >
            {alignmentLabels[pair.alignment]}
          </span>
          {facets.length > 0 && (
            <p className="mt-1 text-[10px] text-[var(--undp-gray)] leading-tight">
              {facets.join(" · ")}
            </p>
          )}
        </div>
        <p className="text-[10px] text-[var(--undp-gray)] mb-1">
          {docA} {targetA.sourceLabel} ↔ {docB} {targetB.sourceLabel}
        </p>
        {pair.description && (
          <p
            className="text-[11.5px] text-[var(--undp-black)] leading-snug italic overflow-hidden"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {pair.description}
          </p>
        )}
      </Tag>
    </li>
  );
}

function LegacyDrawerList({
  heading,
  empty,
  entries,
  countryConfig,
  onOpenTargetPair,
}: {
  heading: string;
  empty: string;
  entries: FaultLine[];
  countryConfig: CountryConfig | null;
  onOpenTargetPair?: (
    pair: AlignmentResult,
    targetA: Target,
    targetB: Target,
  ) => void;
}) {
  return (
    <section>
      <h4 className="text-sm font-medium text-[var(--undp-black)] mb-3">
        {heading}
      </h4>
      {entries.length === 0 ? (
        <p className="text-xs text-[var(--undp-gray)] italic">{empty}</p>
      ) : (
        <ol className="space-y-2">
          {entries.map((line) => (
            <ExampleRow
              key={`${line.pair.targetAId}__${line.pair.targetBId}`}
              line={line}
              countryConfig={countryConfig}
              onOpen={
                onOpenTargetPair
                  ? () => onOpenTargetPair(line.pair, line.targetA, line.targetB)
                  : undefined
              }
            />
          ))}
        </ol>
      )}
    </section>
  );
}
