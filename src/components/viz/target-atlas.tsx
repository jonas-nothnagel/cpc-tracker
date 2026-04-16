"use client";

/**
 * Target Atlas — cross-layer quadrant scatter, plug-and-play by taxonomy.
 *
 * A "lens" taxonomy is the connecting piece across policy, finance and
 * implementation: two items are linked if they share at least one relevant
 * category in the selected taxonomy. Both axes and the color encoding
 * recompute when the lens changes.
 *
 *   X = coherence     (# cross-doc policy targets sharing a category)
 *   Y = backing       (# BER programmes + # BTR actions sharing a category)
 *   Red outer ring   = contradictions detected by the LLM alignment pass
 *   Color            = primary category in the current lens
 *
 * Click a dot to open a side panel with the bridged items and the LLM
 * alignment score per item (the two methods are shown together so users
 * can audit agreement/disagreement).
 */

import React, { useEffect, useMemo, useState } from "react";
import { InfoBox } from "@/components/ui/info-box";
import {
  ALIGNMENT_WEIGHTS,
  budgetBackingLabel,
  buildAtlasSignals,
  classifyQuadrant,
  quadrantThreshold,
  tensionRingWidth,
  QUADRANT_LABELS,
  type AtlasSignal,
  type AtlasTaxonomy,
  type Quadrant,
} from "@/lib/target-atlas-signals";
import {
  ALIGNMENT_COLORS,
  ALIGNMENT_LABELS,
  getDocMediumLabel,
} from "@/lib/utils";
import { isContradiction } from "@/types";
import type {
  Target,
  ThematicClassification,
  AlignmentResult,
  AlignmentLevel,
  IpccSector,
  GlobeCategory,
  NbsCategory,
  CountryConfig,
  BerData,
} from "@/types";

// 12-colour qualitative palette chosen for distinguishability at small dot
// sizes. Red is reserved for tension rings, so the palette skips red/
// vermilion hues. Hues are spread across the wheel (blue / orange / green /
// purple / brown / pink / olive / cyan / gold / dark-blue / wine / dark-olive)
// to avoid the old issue where several categories read as "purple-ish".
const PALETTE = [
  "#1f77b4", "#ff7f0e", "#2ca02c", "#9467bd",
  "#8c564b", "#e377c2", "#bcbd22", "#17becf",
  "#f0c800", "#393b79", "#843c39", "#637939",
];
const UNCLASSIFIED_COLOR = "#94a3b8";
const DOT_R = 7;

const VB_W = 960;
const VB_H = 580;
const MARGIN = { top: 28, right: 24, bottom: 48, left: 64 };
const PLOT_W = VB_W - MARGIN.left - MARGIN.right;
const PLOT_H = VB_H - MARGIN.top - MARGIN.bottom;

interface Props {
  /** Policy targets only (no BER_/BTR_ pseudo). */
  policyTargets: Target[];
  /** All targets including pseudo — for neighbor label lookup. */
  allTargets: Target[];
  classifications: ThematicClassification[];
  alignments: AlignmentResult[];
  budgetAlignments: AlignmentResult[] | null;
  nbsCategories: NbsCategory[];
  sectors: IpccSector[];
  globeCategories: GlobeCategory[];
  countryConfig: CountryConfig | null;
  /** BER expenditure data — used to weight the "Budget" ranking by spend share. Optional. */
  berData?: BerData | null;
}

type TaxonomyChoice = {
  id: AtlasTaxonomy;
  label: string;
  categories: { id: string; name: string }[];
};

export function TargetAtlas({
  policyTargets,
  allTargets,
  classifications,
  alignments,
  budgetAlignments,
  nbsCategories,
  sectors,
  globeCategories,
  countryConfig,
  berData,
}: Props) {
  const taxonomyChoices: TaxonomyChoice[] = useMemo(() => {
    const out: TaxonomyChoice[] = [];
    if (globeCategories.length > 0)
      out.push({ id: "globe", label: "Biodiversity (GLOBE)", categories: globeCategories });
    if (sectors.length > 0)
      out.push({ id: "sector", label: "Climate mitigation (IPCC)", categories: sectors });
    if (nbsCategories.length > 0)
      out.push({ id: "nbs", label: "Nature-based solutions (NBS)", categories: nbsCategories });
    return out;
  }, [globeCategories, sectors, nbsCategories]);

  const [lens, setLens] = useState<AtlasTaxonomy>(
    taxonomyChoices[0]?.id ?? "globe"
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [showEdges, setShowEdges] = useState(true);
  const [hideLensOrphans, setHideLensOrphans] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // Clear category selection whenever the lens changes — categories are not
  // comparable across lenses, so the highlight would be nonsensical.
  useEffect(() => {
    setSelectedCategoryId(null);
  }, [lens]);

  const targetsById = useMemo(() => {
    const m = new Map<string, Target>();
    for (const t of allTargets) m.set(t.id, t);
    return m;
  }, [allTargets]);

  const allSignals = useMemo(() => {
    return buildAtlasSignals({
      policyTargets,
      classifications,
      alignments,
      budgetAlignments,
      targetsById,
      bridgeTaxonomy: lens,
    });
  }, [policyTargets, classifications, alignments, budgetAlignments, targetsById, lens]);

  const lensOrphanCount = allSignals.filter((s) => s.lensCategoryCount === 0).length;
  const signals = useMemo(
    () => (hideLensOrphans ? allSignals.filter((s) => s.lensCategoryCount > 0) : allSignals),
    [allSignals, hideLensOrphans],
  );

  const hasBer = (budgetAlignments?.length ?? 0) > 0;
  const hasBtr = allTargets.some((t) => t.sourceDocument === "BTR");

  const colorLookup = useMemo(() => {
    const choice = taxonomyChoices.find((t) => t.id === lens);
    if (!choice) return new Map<string, { color: string; name: string }>();
    const out = new Map<string, { color: string; name: string }>();
    choice.categories.forEach((c, i) => {
      out.set(c.id, { color: PALETTE[i % PALETTE.length], name: c.name });
    });
    return out;
  }, [lens, taxonomyChoices]);

  // Primary-category count for BER programmes and BTR actions — drives the
  // "Budget" and "Implementation" rank-by modes. Uses primary classification
  // only so each programme/action is counted once per lens.
  const budgetByCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of classifications) {
      if (!c.isPrimary || c.taxonomyType !== lens) continue;
      const t = targetsById.get(c.targetId);
      if (!t || t.sourceDocument !== "BER") continue;
      m.set(c.categoryId, (m.get(c.categoryId) ?? 0) + 1);
    }
    return m;
  }, [classifications, lens, targetsById]);

  const implByCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of classifications) {
      if (!c.isPrimary || c.taxonomyType !== lens) continue;
      const t = targetsById.get(c.targetId);
      if (!t || t.sourceDocument !== "BTR") continue;
      m.set(c.categoryId, (m.get(c.categoryId) ?? 0) + 1);
    }
    return m;
  }, [classifications, lens, targetsById]);

  // Aggregate BER spend per primary lens category. Sums values across all
  // years on each programme's expenditure row. Null when berData missing.
  const spendByCat = useMemo(() => {
    if (!berData?.expenditure) return null;
    const totalByCode = new Map<string, number>();
    for (const row of berData.expenditure) {
      let sum = 0;
      for (const v of Object.values(row.values ?? {})) {
        if (typeof v === "number") sum += v;
      }
      totalByCode.set(row.code, sum);
    }
    const m = new Map<string, number>();
    for (const c of classifications) {
      if (!c.isPrimary || c.taxonomyType !== lens) continue;
      if (!c.targetId.startsWith("BER_")) continue;
      const code = c.targetId.slice(4);
      const amt = totalByCode.get(code) ?? 0;
      m.set(c.categoryId, (m.get(c.categoryId) ?? 0) + amt);
    }
    return m;
  }, [berData, classifications, lens]);

  const xMax = Math.max(1, ...signals.map((s) => s.coherenceCount));
  const yMax = Math.max(1, ...signals.map((s) => s.backingCount));
  const xThreshold = useMemo(
    () => quadrantThreshold(signals.map((s) => s.coherenceCount)),
    [signals]
  );
  const yThreshold = useMemo(
    () => quadrantThreshold(signals.map((s) => s.backingCount)),
    [signals]
  );

  const xScale = (v: number) => MARGIN.left + (v / xMax) * PLOT_W;
  const yScale = (v: number) => MARGIN.top + PLOT_H - (v / yMax) * PLOT_H;

  const jitter = (id: string): { dx: number; dy: number } => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    const dx = ((h & 0xff) / 255 - 0.5) * 12;
    const dy = (((h >> 8) & 0xff) / 255 - 0.5) * 12;
    return { dx, dy };
  };

  const selectedSignal = selectedId
    ? signals.find((s) => s.targetId === selectedId) ?? null
    : null;
  const selectedTarget = selectedId ? targetsById.get(selectedId) ?? null : null;
  const hoverSignal = hoveredId
    ? signals.find((s) => s.targetId === hoveredId) ?? null
    : null;
  const hoverTarget = hoveredId ? targetsById.get(hoveredId) ?? null : null;

  const connectedIds = useMemo(() => {
    if (!selectedSignal) return new Set<string>();
    return new Set(selectedSignal.alignmentNeighbors.map((n) => n.targetId));
  }, [selectedSignal]);

  const positions = useMemo(() => {
    const m = new Map<string, { cx: number; cy: number; signal: AtlasSignal }>();
    for (const s of signals) {
      const { dx, dy } = jitter(s.targetId);
      m.set(s.targetId, {
        cx: xScale(s.coherenceCount) + dx,
        cy: yScale(s.backingCount) + dy,
        signal: s,
      });
    }
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signals, xMax, yMax]);

  return (
    <section className="mb-10 pt-8 border-t-2 border-[var(--undp-blue)]/20">
      <div className="mb-3 flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-[var(--undp-black)]">
          Target Atlas
          <InfoBox>
            Items are connected when they share a relevant category in the
            selected <strong>lens</strong>. Horizontal = # cross-doc policy
            targets sharing a category. Vertical = # BTR actions + # BER
            programmes sharing a category.
            <span style={{ color: "#dc2626" }}> Red ring</span> = LLM-detected
            contradictions with other targets. See &ldquo;How to read
            this&rdquo; below the header for the full story.
          </InfoBox>
        </h2>
        <div className="flex items-center gap-3 text-xs">
          <label htmlFor="atlas-tax" className="text-[var(--undp-gray)]">
            Lens
          </label>
          <select
            id="atlas-tax"
            value={lens}
            onChange={(e) => setLens(e.target.value as AtlasTaxonomy)}
            className="border border-gray-200 rounded-md px-2 py-1 text-xs bg-white"
            title="The connecting taxonomy. Two items are linked (on both axes) if they share a relevant category."
          >
            {taxonomyChoices.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-[var(--undp-gray)] cursor-pointer">
            <input
              type="checkbox"
              checked={hideLensOrphans}
              onChange={(e) => setHideLensOrphans(e.target.checked)}
              className="accent-[var(--undp-blue)]"
            />
            Hide lens-orphans
            {lensOrphanCount > 0 && (
              <span className="text-[10px] text-[var(--undp-gray)]">
                ({lensOrphanCount})
              </span>
            )}
          </label>
          <label className="flex items-center gap-1.5 text-[var(--undp-gray)] cursor-pointer">
            <input
              type="checkbox"
              checked={showEdges}
              onChange={(e) => setShowEdges(e.target.checked)}
              className="accent-[var(--undp-blue)]"
            />
            LLM connection lines
          </label>
        </div>
      </div>

      <p className="text-sm text-[var(--undp-gray)] mb-2">
        Every dot is a policy target from your national documents (NDC,
        NBSAP, NAP, &hellip;). Its position tells you two things at once,
        both seen through the <strong>Lens</strong> chosen above: how this
        target relates to <em>other policies</em>, and how it relates to
        <em> reported government action and national budget</em>. Click any
        dot for details.
        {!hasBer && " No BER (budget) data for this country, so the vertical axis reflects reported action only."}
        {!hasBtr && " No BTR (reported action) data, so the vertical axis reflects budget only."}
      </p>

      <details className="mb-3 text-sm [&_summary]:list-none">
        <summary className="cursor-pointer inline-flex items-center gap-1.5 text-[var(--undp-blue)] hover:underline">
          <span className="text-xs transition-transform details-chevron">▸</span>
          How to read this &ndash; and what it answers
        </summary>
        <div className="mt-2 pl-4 space-y-4 text-[13px] text-[var(--undp-gray)] leading-snug max-w-3xl">

          <div>
            <p className="font-semibold text-[var(--undp-black)] mb-1">
              How a target gets its position
            </p>
            <p>
              Every target, every reported action (BTR), and every budget
              programme (BER) is tagged with categories from a shared
              taxonomy &mdash; the <strong>Lens</strong>. Two items are
              &ldquo;linked&rdquo; when they share at least one tag. No
              human hand-picks these links, and no single opaque score
              drives position.
            </p>
            <ul className="mt-1 space-y-1 list-disc pl-5">
              <li>
                <strong className="text-[var(--undp-black)]">Horizontal (coherence)</strong>{" "}
                counts linked policy targets in <em>other</em> documents.
                Further right = the same idea comes up again and again
                across the policy stack.
              </li>
              <li>
                <strong className="text-[var(--undp-black)]">Vertical (backing)</strong>{" "}
                adds linked BTR actions + linked BER programmes. Further up
                = reported action and/or budget already exist in the same
                area.
              </li>
              <li>
                <strong className="text-[var(--undp-black)]">
                  <span style={{ color: "#dc2626" }}>Red ring</span>
                </strong>{" "}
                marks <em>high-tension</em> targets only &mdash; those
                flagged as contradicting <strong>5 or more</strong> other
                policy targets. Low-tension targets aren&apos;t ringed, to
                keep the chart readable; every tension is still listed in
                the side panel when you click a dot. Tensions sit alongside
                the axes, not subtracted from them &mdash; a target can be
                strongly aligned <em>and</em> contested.
              </li>
            </ul>
            <p className="mt-2 text-xs italic">
              Only targets that carry at least one tag in the current lens
              are shown. Turn on &ldquo;Hide lens-orphans&rdquo; to remove
              targets pinned to the origin because this lens doesn&apos;t
              apply to them (e.g. public-health targets under a biodiversity
              lens).
            </p>
          </div>

          <div>
            <p className="font-semibold text-[var(--undp-black)] mb-1">
              What the four quadrants mean
            </p>
            <ul className="space-y-2">
              <li>
                <strong className="text-[var(--undp-black)]">Well-supported (top right)</strong>{" "}
                &mdash; linked to many other policy targets <em>and</em> to
                reported action or budget. The country&apos;s policy stack
                and its implementation/financing machinery both back this
                target.{" "}
                <em className="text-[var(--undp-gray)]">
                  e.g. a renewable-energy target that recurs across NDC,
                  NBSAP and NAP and is covered by BTR mitigation measures
                  and a BER programme.
                </em>
              </li>
              <li>
                <strong className="text-[var(--undp-black)]">Ambition gap (bottom right)</strong>{" "}
                &mdash; echoed across many policies, but no reported action
                and no budget programme touches the same area. The classic
                &ldquo;say-do&rdquo; gap.{" "}
                <em className="text-[var(--undp-gray)]">
                  e.g. a pollinator-habitat restoration target that several
                  documents mention but no BTR action or BER programme
                  covers.
                </em>
              </li>
              <li>
                <strong className="text-[var(--undp-black)]">Backed but isolated (top left)</strong>{" "}
                &mdash; reported action or budget is there, but few other
                policy targets reinforce it. The country is doing or paying
                for something that stands on its own.{" "}
                <em className="text-[var(--undp-gray)]">
                  e.g. an anti-desertification budget line that isn&apos;t
                  strongly echoed in NBSAP, NDC or NAP.
                </em>
              </li>
              <li>
                <strong className="text-[var(--undp-black)]">Limited uptake (bottom left)</strong>{" "}
                &mdash; few cross-policy links, few reported actions, few
                budget programmes in this area. Could be a strategic
                orphan, a very narrow target, or a poor fit for this lens.
                Worth a direct read before judging.
              </li>
            </ul>
          </div>

          <div>
            <p className="font-semibold text-[var(--undp-black)] mb-1">
              What each kind of link actually tells you
            </p>
            <ul className="space-y-1 list-disc pl-5">
              <li>
                <strong className="text-[var(--undp-black)]">Link to another policy target</strong>{" "}
                &rarr; two documents contain objectives that fall in the
                same thematic area. They reinforce each other.
              </li>
              <li>
                <strong className="text-[var(--undp-black)]">Link to a BTR action</strong>{" "}
                &rarr; the country&apos;s Biennial Transparency Report lists
                a mitigation measure or adaptation action in the same
                thematic area. It means the country is <em>already doing
                something</em> related to this target.
              </li>
              <li>
                <strong className="text-[var(--undp-black)]">Link to a BER programme</strong>{" "}
                &rarr; a named budget line in the Biodiversity Expenditure
                Review funds activity in the same thematic area. The
                country is <em>already paying for</em> something related.
                It&apos;s a count of programmes, not a currency amount
                &mdash; dollar totals per category live in the{" "}
                <em>Financing Coherence</em> section below.
              </li>
            </ul>
          </div>

          <div>
            <p className="font-semibold text-[var(--undp-black)] mb-1">
              Switching the lens changes everything
            </p>
            <p>
              A target classified as &ldquo;Restoration&rdquo; in GLOBE may
              be classified as &ldquo;LULUCF&rdquo; under IPCC sector and
              &ldquo;Forest management&rdquo; under NBS. Each lens re-wires
              the network of shared tags, so the same target can move from
              edge to centre when you pick a different lens. Use this to
              cross-check: a target that looks isolated under one lens but
              load-bearing under another is telling you something about
              framing, not failure.
            </p>
          </div>

          <div>
            <p className="font-semibold text-[var(--undp-black)] mb-1">
              Auditability
            </p>
            <p>
              Click any dot. The side panel lists the shared tags connecting
              it to every linked programme and action, alongside a second,
              independent LLM-generated alignment score. Where the two
              agree, confidence is high. Where they disagree, surface for
              discussion &mdash; the tags are the authoritative link; the
              LLM read is a cross-check.
            </p>
          </div>
        </div>
      </details>

      <div className="flex gap-4 flex-col lg:flex-row">
        <div
          className="flex-1 min-w-0 bg-white border border-gray-100 rounded-lg p-3"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedId(null);
              setSelectedCategoryId(null);
            }
          }}
        >
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            className="w-full h-auto select-none"
            onClick={(e) => {
              const tag = (e.target as SVGElement).tagName;
              if (tag === "svg" || tag === "rect") {
                setSelectedId(null);
                setSelectedCategoryId(null);
              }
            }}
          >
            <QuadrantBackdrop
              xThresholdPx={xScale(xThreshold)}
              yThresholdPx={yScale(yThreshold)}
            />

            {/* Axes */}
            <g>
              <line
                x1={MARGIN.left} y1={MARGIN.top + PLOT_H}
                x2={MARGIN.left + PLOT_W} y2={MARGIN.top + PLOT_H}
                stroke="#94a3b8" strokeWidth={1}
              />
              <line
                x1={MARGIN.left} y1={MARGIN.top}
                x2={MARGIN.left} y2={MARGIN.top + PLOT_H}
                stroke="#94a3b8" strokeWidth={1}
              />
              <text
                x={MARGIN.left + PLOT_W / 2}
                y={VB_H - 14}
                textAnchor="middle"
                fontSize={12}
                fill="#64748b"
              >
                Coherence — cross-doc policy targets sharing a lens category
              </text>
              <text
                x={-(MARGIN.top + PLOT_H / 2)}
                y={18}
                transform="rotate(-90)"
                textAnchor="middle"
                fontSize={12}
                fill="#64748b"
              >
                Backing — BTR actions + BER programmes sharing a lens category
              </text>
            </g>

            <QuadrantLabels />

            {/* Category cloud — soft blurred coverage of a selected
                taxonomy category, to show how a whole category tends to
                sit across the quadrants. Renders behind dots and edges. */}
            {selectedCategoryId && (() => {
              const isUnclassified = selectedCategoryId === "_unclassified";
              const catSignals = signals.filter((s) =>
                isUnclassified ? !s.lensPrimary : s.lensPrimary === selectedCategoryId,
              );
              if (catSignals.length === 0) return null;
              const cloudColor = isUnclassified
                ? UNCLASSIFIED_COLOR
                : colorLookup.get(selectedCategoryId)?.color ?? UNCLASSIFIED_COLOR;
              return (
                <g pointerEvents="none" style={{ filter: "blur(14px)" }}>
                  {catSignals.map((s) => {
                    const p = positions.get(s.targetId);
                    if (!p) return null;
                    return (
                      <circle
                        key={`cloud-${s.targetId}`}
                        cx={p.cx}
                        cy={p.cy}
                        r={30}
                        fill={cloudColor}
                        fillOpacity={0.45}
                      />
                    );
                  })}
                </g>
              );
            })()}

            {/* Edges — straight lines, only strong (med/high) + tensions.
                Off by default; turn on via the "Connection lines" checkbox
                to see the selected target's alignment web. */}
            {showEdges && selectedId && (
              <g pointerEvents="none">
                {(() => {
                  const from = positions.get(selectedId);
                  if (!from || !selectedSignal) return null;
                  return selectedSignal.alignmentNeighbors
                    .filter(
                      (n) =>
                        n.alignment === "medium" ||
                        n.alignment === "high" ||
                        isContradiction(n.alignment),
                    )
                    .map((n) => {
                      const to = positions.get(n.targetId);
                      if (!to) return null;
                      const color = ALIGNMENT_COLORS[n.alignment];
                      const width = 1 + 0.7 * (ALIGNMENT_WEIGHTS[n.alignment] ?? 1);
                      const dashed = isContradiction(n.alignment);
                      return (
                        <line
                          key={`e-${n.targetId}`}
                          x1={from.cx}
                          y1={from.cy}
                          x2={to.cx}
                          y2={to.cy}
                          stroke={color}
                          strokeWidth={width}
                          strokeOpacity={0.55}
                          strokeDasharray={dashed ? "5 3" : undefined}
                        />
                      );
                    });
                })()}
              </g>
            )}

            {/* Dots. Budget is already factored into Y position, so shape
                is uniform — no hollow/solid/pearl distinction. */}
            <g>
              {signals.map((s) => {
                const pos = positions.get(s.targetId)!;
                const target = targetsById.get(s.targetId);
                const primaryCat = s.primaryByTaxonomy[lens];
                const color = primaryCat
                  ? colorLookup.get(primaryCat)?.color ?? UNCLASSIFIED_COLOR
                  : UNCLASSIFIED_COLOR;
                const isSelected = selectedId === s.targetId;
                const isHovered = hoveredId === s.targetId;
                const isInSelectedCategory = selectedCategoryId
                  ? s.lensPrimary === selectedCategoryId ||
                    (selectedCategoryId === "_unclassified" && !s.lensPrimary)
                  : true;
                const dimmed =
                  (!!selectedId && !isSelected && !connectedIds.has(s.targetId)) ||
                  (!selectedId && !isInSelectedCategory);
                const dimMul = dimmed ? 0.2 : 1;
                const ringWidth = tensionRingWidth(s.tensionCount);

                return (
                  <g
                    key={s.targetId}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => setHoveredId(s.targetId)}
                    onMouseLeave={() =>
                      setHoveredId((h) => (h === s.targetId ? null : h))
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId((id) => (id === s.targetId ? null : s.targetId));
                    }}
                  >
                    {ringWidth !== null && (
                      <circle
                        cx={pos.cx}
                        cy={pos.cy}
                        r={DOT_R + 3}
                        fill="none"
                        stroke="#dc2626"
                        strokeWidth={ringWidth}
                        opacity={0.9 * dimMul}
                      />
                    )}
                    <circle
                      cx={pos.cx}
                      cy={pos.cy}
                      r={DOT_R}
                      fill={color}
                      fillOpacity={dimMul}
                      stroke={isSelected ? "#1e293b" : color}
                      strokeOpacity={dimMul}
                      strokeWidth={isSelected ? 2.5 : isHovered ? 1.6 : 1}
                    />
                    {isSelected && (
                      <circle
                        cx={pos.cx}
                        cy={pos.cy}
                        r={DOT_R + 5}
                        fill="none"
                        stroke="#1e293b"
                        strokeWidth={1}
                        strokeDasharray="3 2"
                      />
                    )}
                    <title>
                      {target?.sourceLabel ?? s.targetId} ·{" "}
                      {getDocMediumLabel(countryConfig, target?.sourceDocument ?? "")}
                      {"\n"}
                      Coherence {s.coherenceCount} · Implementation{" "}
                      {s.implementationCount} · Budget {s.budgetCount}
                      {s.tensionCount > 0
                        ? `\nTensions ${s.tensionCount}`
                        : ""}
                    </title>
                  </g>
                );
              })}
            </g>
          </svg>

          <Legend taxonomyChoices={taxonomyChoices} lens={lens} />
        </div>

        <div className="lg:w-[380px] shrink-0 self-start lg:sticky lg:top-20">
          {selectedSignal && selectedTarget ? (
            <SidePanel
              signal={selectedSignal}
              target={selectedTarget}
              targetsById={targetsById}
              xThreshold={xThreshold}
              yThreshold={yThreshold}
              countryConfig={countryConfig}
              lensLabel={
                taxonomyChoices.find((t) => t.id === lens)?.label ?? lens
              }
              lensCategoryLookup={colorLookup}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <CategoryRanking
              signals={signals}
              xThreshold={xThreshold}
              yThreshold={yThreshold}
              lensLabel={taxonomyChoices.find((t) => t.id === lens)?.label ?? lens}
              categoryLookup={colorLookup}
              budgetByCat={budgetByCat}
              implByCat={implByCat}
              spendByCat={spendByCat}
              budgetUnit={berData?.unit ?? null}
              budgetCurrency={berData?.currency ?? null}
              selectedCategoryId={selectedCategoryId}
              onSelectCategory={(id) =>
                setSelectedCategoryId((cur) => (cur === id ? null : id))
              }
            />
          )}
        </div>
      </div>

      {hoverSignal && hoverTarget && !selectedId && (
        <div className="mt-3 text-xs text-[var(--undp-gray)] bg-[var(--undp-light)] border border-gray-100 rounded p-2">
          <span className="font-semibold text-[var(--undp-black)]">
            {getDocMediumLabel(countryConfig, hoverTarget.sourceDocument)}{" "}
            {hoverTarget.sourceLabel}
          </span>
          {" — "}
          Coherence {hoverSignal.coherenceCount} · Implementation{" "}
          {hoverSignal.implementationCount} · Budget {hoverSignal.budgetCount}
          {hoverSignal.tensionCount > 0
            ? ` · Tensions ${hoverSignal.tensionCount}`
            : ""}
        </div>
      )}
    </section>
  );
}

// ── Category breakdown ─────────────────────────────────────────────────
// Three ranking modes, selected by the user via a tab strip:
//   - "policy"         rank by # policy targets landing in "Well-supported".
//                      Bar shows the quadrant distribution.
//   - "budget"         rank by BER-programme count in each category, with a
//                      bar width proportional to % of BER spend (when BER
//                      expenditure data is available — otherwise by count).
//                      This is the view a finance reader wants: it surfaces
//                      categories where money concentrates, not categories
//                      where policy targets concentrate.
//   - "implementation" rank by # BTR actions classified to each category.
const QUADRANT_TINTS: Record<Quadrant, string> = {
  well_supported: "#86efac",
  backed_isolated: "#7dd3fc",
  ambition_gap: "#fcd34d",
  limited_uptake: "#cbd5e1",
};

type RankBy = "policy" | "budget" | "implementation";

const RANK_TABS: { id: RankBy; label: string }[] = [
  { id: "policy", label: "Policy" },
  { id: "budget", label: "Budget" },
  { id: "implementation", label: "Implementation" },
];

function CategoryRanking({
  signals,
  xThreshold,
  yThreshold,
  lensLabel,
  categoryLookup,
  budgetByCat,
  implByCat,
  spendByCat,
  budgetUnit,
  budgetCurrency,
  selectedCategoryId,
  onSelectCategory,
}: {
  signals: AtlasSignal[];
  xThreshold: number;
  yThreshold: number;
  lensLabel: string;
  categoryLookup: Map<string, { color: string; name: string }>;
  budgetByCat: Map<string, number>;
  implByCat: Map<string, number>;
  spendByCat: Map<string, number> | null;
  budgetUnit: string | null;
  budgetCurrency: string | null;
  selectedCategoryId: string | null;
  onSelectCategory: (id: string) => void;
}) {
  const [rankBy, setRankBy] = useState<RankBy>("policy");

  const catMeta = (id: string) => ({
    id,
    name:
      id === "_unclassified"
        ? "Unclassified"
        : categoryLookup.get(id)?.name ?? id,
    color:
      id === "_unclassified"
        ? UNCLASSIFIED_COLOR
        : categoryLookup.get(id)?.color ?? UNCLASSIFIED_COLOR,
  });

  // Disable tabs that have no data under this lens.
  const tabDisabled: Record<RankBy, boolean> = {
    policy: false,
    budget: budgetByCat.size === 0,
    implementation: implByCat.size === 0,
  };

  // ── Policy mode ──────────────────────────────────────────────────
  const policyRows = (() => {
    const buckets = new Map<
      string,
      Record<Quadrant, number> & { total: number }
    >();
    for (const s of signals) {
      const cat = s.lensPrimary ?? "_unclassified";
      const q = classifyQuadrant(
        s.coherenceCount,
        s.backingCount,
        xThreshold,
        yThreshold,
      );
      const row =
        buckets.get(cat) ??
        {
          well_supported: 0,
          backed_isolated: 0,
          ambition_gap: 0,
          limited_uptake: 0,
          total: 0,
        };
      row[q] += 1;
      row.total += 1;
      buckets.set(cat, row);
    }
    return Array.from(buckets.entries())
      .filter(([, v]) => v.total > 0)
      .map(([id, v]) => ({ ...catMeta(id), ...v }))
      .sort(
        (a, b) =>
          b.well_supported - a.well_supported || b.total - a.total,
      );
  })();
  const policyWidest = Math.max(...policyRows.map((r) => r.total), 1);

  // ── Budget mode ──────────────────────────────────────────────────
  const totalSpend = spendByCat
    ? Array.from(spendByCat.values()).reduce((s, v) => s + v, 0)
    : 0;
  const budgetRows = Array.from(budgetByCat.entries())
    .map(([id, count]) => {
      const spend = spendByCat?.get(id) ?? 0;
      const share = totalSpend > 0 ? spend / totalSpend : 0;
      return { ...catMeta(id), count, spend, share };
    })
    .sort((a, b) => b.share - a.share || b.count - a.count);
  const budgetWidest = spendByCat
    ? Math.max(...budgetRows.map((r) => r.share), 0.0001)
    : Math.max(...budgetRows.map((r) => r.count), 1);

  // ── Implementation mode ──────────────────────────────────────────
  const implRows = Array.from(implByCat.entries())
    .map(([id, count]) => ({ ...catMeta(id), count }))
    .sort((a, b) => b.count - a.count);
  const implWidest = Math.max(...implRows.map((r) => r.count), 1);

  const rows =
    rankBy === "policy"
      ? policyRows
      : rankBy === "budget"
        ? budgetRows
        : implRows;
  if (rows.length === 0) return null;

  const title =
    rankBy === "policy"
      ? `Most supported ${lensLabel} categories`
      : rankBy === "budget"
        ? `Where the budget flows (${lensLabel})`
        : `Where reported action concentrates (${lensLabel})`;

  const subtitle =
    rankBy === "policy"
      ? "Taxonomy areas ranked by policy targets that land in \u201CWell-supported\u201D (policy, action and budget combined). Click a row to highlight on the chart."
      : rankBy === "budget"
        ? spendByCat
          ? `BER programmes grouped by their primary ${lensLabel} category. Bar width is share of total biodiversity expenditure. Click a row to highlight related policy targets on the chart.`
          : `BER programmes grouped by their primary ${lensLabel} category. Bar width is # programmes. Click a row to highlight related policy targets on the chart.`
        : `BTR reported actions grouped by their primary ${lensLabel} category. Click a row to highlight related policy targets on the chart.`;

  return (
    <div className="border border-gray-100 rounded-lg p-3 bg-white">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--undp-black)]">
            {title}
          </p>
          <p className="text-[11px] text-[var(--undp-gray)] mt-0.5 leading-snug">
            {subtitle}
          </p>
        </div>
        {selectedCategoryId && (
          <button
            type="button"
            onClick={() => onSelectCategory(selectedCategoryId)}
            className="text-[11px] text-[var(--undp-blue)] hover:underline whitespace-nowrap shrink-0"
          >
            Clear
          </button>
        )}
      </div>

      {/* Rank-by tab strip */}
      <div className="flex items-center gap-1 mb-2 border-b border-gray-100">
        {RANK_TABS.map((t) => {
          const disabled = tabDisabled[t.id];
          const active = rankBy === t.id;
          return (
            <button
              key={t.id}
              type="button"
              disabled={disabled}
              onClick={() => setRankBy(t.id)}
              className={`px-2.5 py-1 text-[11px] rounded-t transition-colors -mb-px border-b-2 ${
                active
                  ? "border-[var(--undp-blue)] text-[var(--undp-blue)] font-semibold"
                  : disabled
                    ? "border-transparent text-gray-300 cursor-not-allowed"
                    : "border-transparent text-[var(--undp-gray)] hover:text-[var(--undp-black)]"
              }`}
              title={disabled ? `No ${t.label.toLowerCase()} data for this lens` : undefined}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="space-y-0.5">
        {rows.map((r) => {
          const isSelected = selectedCategoryId === r.id;
          const isDimmed = selectedCategoryId !== null && !isSelected;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelectCategory(r.id)}
              aria-pressed={isSelected}
              className={`w-full flex items-center gap-2 py-1 px-1.5 rounded text-left transition-colors ${
                isSelected ? "bg-[var(--undp-light)]" : "hover:bg-gray-50"
              } ${isDimmed ? "opacity-55" : ""}`}
            >
              <span className="flex items-center gap-1.5 min-w-0 flex-1 text-[11px]">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: r.color }}
                />
                <span
                  className={`truncate text-[var(--undp-black)] ${
                    isSelected ? "font-semibold" : ""
                  }`}
                  title={r.name}
                >
                  {r.name}
                </span>
              </span>

              {rankBy === "policy" && (
                <>
                  <span
                    className={`tabular-nums whitespace-nowrap w-10 text-right text-[11px] ${
                      isSelected
                        ? "font-semibold text-[var(--undp-black)]"
                        : "text-[var(--undp-gray)]"
                    }`}
                  >
                    {(r as typeof policyRows[number]).well_supported}/
                    {(r as typeof policyRows[number]).total}
                  </span>
                  <span
                    className="w-[110px] h-3 flex rounded-sm overflow-hidden bg-gray-100 shrink-0"
                    title={`Well-supported ${(r as typeof policyRows[number]).well_supported} · Backed but isolated ${(r as typeof policyRows[number]).backed_isolated} · Ambition gap ${(r as typeof policyRows[number]).ambition_gap} · Limited uptake ${(r as typeof policyRows[number]).limited_uptake}`}
                  >
                    {(
                      [
                        "well_supported",
                        "backed_isolated",
                        "ambition_gap",
                        "limited_uptake",
                      ] as const
                    ).map((q) => {
                      const v = (r as typeof policyRows[number])[q];
                      if (v <= 0) return null;
                      return (
                        <span
                          key={q}
                          style={{
                            width: `${(v / policyWidest) * 100}%`,
                            backgroundColor: QUADRANT_TINTS[q],
                          }}
                        />
                      );
                    })}
                  </span>
                </>
              )}

              {rankBy === "budget" && (
                <>
                  <span
                    className={`tabular-nums whitespace-nowrap w-12 text-right text-[11px] ${
                      isSelected
                        ? "font-semibold text-[var(--undp-black)]"
                        : "text-[var(--undp-gray)]"
                    }`}
                    title={
                      spendByCat
                        ? `${(r as typeof budgetRows[number]).count} programmes · ${((r as typeof budgetRows[number]).share * 100).toFixed(1)}% of BER${
                            budgetCurrency || budgetUnit
                              ? ` spend (${[budgetUnit, budgetCurrency].filter(Boolean).join(" ")})`
                              : ""
                          }`
                        : `${(r as typeof budgetRows[number]).count} programmes`
                    }
                  >
                    {spendByCat
                      ? `${((r as typeof budgetRows[number]).share * 100).toFixed(0)}%`
                      : (r as typeof budgetRows[number]).count}
                  </span>
                  <span
                    className="w-[110px] h-3 rounded-sm overflow-hidden bg-gray-100 shrink-0 relative"
                    title={
                      spendByCat
                        ? `${(r as typeof budgetRows[number]).count} BER programme${(r as typeof budgetRows[number]).count === 1 ? "" : "s"} · ${((r as typeof budgetRows[number]).share * 100).toFixed(1)}% of biodiversity expenditure`
                        : `${(r as typeof budgetRows[number]).count} BER programme${(r as typeof budgetRows[number]).count === 1 ? "" : "s"}`
                    }
                  >
                    <span
                      className="absolute inset-y-0 left-0"
                      style={{
                        width: spendByCat
                          ? `${((r as typeof budgetRows[number]).share / budgetWidest) * 100}%`
                          : `${((r as typeof budgetRows[number]).count / budgetWidest) * 100}%`,
                        backgroundColor: r.color,
                      }}
                    />
                  </span>
                </>
              )}

              {rankBy === "implementation" && (
                <>
                  <span
                    className={`tabular-nums whitespace-nowrap w-10 text-right text-[11px] ${
                      isSelected
                        ? "font-semibold text-[var(--undp-black)]"
                        : "text-[var(--undp-gray)]"
                    }`}
                    title={`${(r as typeof implRows[number]).count} BTR action${(r as typeof implRows[number]).count === 1 ? "" : "s"}`}
                  >
                    {(r as typeof implRows[number]).count}
                  </span>
                  <span
                    className="w-[110px] h-3 rounded-sm overflow-hidden bg-gray-100 shrink-0 relative"
                  >
                    <span
                      className="absolute inset-y-0 left-0"
                      style={{
                        width: `${((r as typeof implRows[number]).count / implWidest) * 100}%`,
                        backgroundColor: r.color,
                      }}
                    />
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>

      {/* Quadrant legend only applies to the Policy mode. */}
      {rankBy === "policy" && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--undp-gray)]">
          {(
            [
              ["well_supported", "Well-supported"],
              ["backed_isolated", "Backed but isolated"],
              ["ambition_gap", "Ambition gap"],
              ["limited_uptake", "Limited uptake"],
            ] as [Quadrant, string][]
          ).map(([q, label]) => (
            <span key={q} className="flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ backgroundColor: QUADRANT_TINTS[q] }}
              />
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Backdrop / labels ─────────────────────────────────────────────────
function QuadrantBackdrop({
  xThresholdPx,
  yThresholdPx,
}: {
  xThresholdPx: number;
  yThresholdPx: number;
}) {
  const left = MARGIN.left;
  const right = MARGIN.left + PLOT_W;
  const top = MARGIN.top;
  const bottom = MARGIN.top + PLOT_H;
  return (
    <g opacity={0.45}>
      <rect
        x={left} y={top}
        width={xThresholdPx - left} height={yThresholdPx - top}
        fill="#e0f2fe"
      />
      <rect
        x={xThresholdPx} y={top}
        width={right - xThresholdPx} height={yThresholdPx - top}
        fill="#dcfce7"
      />
      <rect
        x={left} y={yThresholdPx}
        width={xThresholdPx - left} height={bottom - yThresholdPx}
        fill="#f1f5f9"
      />
      <rect
        x={xThresholdPx} y={yThresholdPx}
        width={right - xThresholdPx} height={bottom - yThresholdPx}
        fill="#fef3c7"
      />
      <line
        x1={xThresholdPx} y1={top} x2={xThresholdPx} y2={bottom}
        stroke="#94a3b8" strokeDasharray="3 3" strokeWidth={1} opacity={0.6}
      />
      <line
        x1={left} y1={yThresholdPx} x2={right} y2={yThresholdPx}
        stroke="#94a3b8" strokeDasharray="3 3" strokeWidth={1} opacity={0.6}
      />
    </g>
  );
}

function QuadrantLabels() {
  const left = MARGIN.left + 12;
  const right = MARGIN.left + PLOT_W - 12;
  const top = MARGIN.top + 18;
  const bottom = MARGIN.top + PLOT_H - 26;
  const titleProps = {
    fontSize: 12.5,
    fontWeight: 600,
    fill: "#334155",
  };
  const subtitleProps = {
    fontSize: 10.5,
    fill: "#64748b",
  };
  return (
    <g className="pointer-events-none">
      {/* top-right */}
      <text x={right} y={top} textAnchor="end" {...titleProps}>
        {QUADRANT_LABELS.well_supported}
      </text>
      <text x={right} y={top + 15} textAnchor="end" {...subtitleProps}>
        Reinforced across policies and backed by action or budget
      </text>

      {/* top-left */}
      <text x={left} y={top} {...titleProps}>
        {QUADRANT_LABELS.backed_isolated}
      </text>
      <text x={left} y={top + 15} {...subtitleProps}>
        Implementation or budget without broad policy agreement
      </text>

      {/* bottom-right */}
      <text x={right} y={bottom} textAnchor="end" {...titleProps}>
        {QUADRANT_LABELS.ambition_gap}
      </text>
      <text x={right} y={bottom + 15} textAnchor="end" {...subtitleProps}>
        Policy ambition without action or funding yet
      </text>

      {/* bottom-left */}
      <text x={left} y={bottom} {...titleProps}>
        {QUADRANT_LABELS.limited_uptake}
      </text>
      <text x={left} y={bottom + 15} {...subtitleProps}>
        Rarely referenced and rarely acted upon
      </text>
    </g>
  );
}

// ── Legend ────────────────────────────────────────────────────────────
function Legend({
  taxonomyChoices,
  lens,
}: {
  taxonomyChoices: TaxonomyChoice[];
  lens: AtlasTaxonomy;
}) {
  const choice = taxonomyChoices.find((t) => t.id === lens);
  return (
    <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 text-[11px]">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-1.5">
          {choice?.label ?? ""}
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {choice?.categories.map((c, i) => (
            <span key={c.id} className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
              />
              <span className="text-[var(--undp-gray)]">{c.name}</span>
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: UNCLASSIFIED_COLOR }} />
            <span className="text-[var(--undp-gray)]">Unclassified</span>
          </span>
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-1.5">
          High-tension targets
        </p>
        <span className="flex items-center gap-1.5">
          <svg width={28} height={28} className="shrink-0" aria-hidden>
            <circle cx="14" cy="14" r="5" fill="#cbd5e1" />
            <circle cx="14" cy="14" r="9.5" fill="none" stroke="#dc2626" strokeWidth={3} />
          </svg>
          <span className="text-[var(--undp-gray)]">
            5+ contradictions with other targets
          </span>
        </span>
      </div>
    </div>
  );
}

// ── Side panel ────────────────────────────────────────────────────────
function SidePanel({
  signal,
  target,
  targetsById,
  xThreshold,
  yThreshold,
  countryConfig,
  lensLabel,
  lensCategoryLookup,
  onClose,
}: {
  signal: AtlasSignal;
  target: Target;
  targetsById: Map<string, Target>;
  xThreshold: number;
  yThreshold: number;
  countryConfig: CountryConfig | null;
  lensLabel: string;
  lensCategoryLookup: Map<string, { color: string; name: string }>;
  onClose: () => void;
}) {
  const quadrant = classifyQuadrant(
    signal.coherenceCount,
    signal.backingCount,
    xThreshold,
    yThreshold,
  );

  // Target's own relevant categories in the current lens (gathered from the
  // bridge links — every link shares at least one, union covers the target's
  // lens footprint). When empty, the target has no classifications in this
  // lens and sits at origin by definition.
  const lensCategoriesForTarget = new Set<string>();
  for (const lk of [
    ...signal.coherenceBridgeLinks,
    ...signal.budgetBridgeLinks,
    ...signal.actionBridgeLinks,
  ]) {
    for (const c of lk.sharedCategories) lensCategoriesForTarget.add(c);
  }

  // LLM rating lookup by pseudo-target id (for programmes and BTR actions).
  const llmBudgetByPseudoId = new Map(
    signal.budgetLinks.map((b) => [b.pseudoTargetId, b.alignment] as const),
  );
  const llmActionByPseudoId = new Map(
    signal.actionLinks.map((a) => [a.pseudoTargetId, a.alignment] as const),
  );
  const llmPolicyByTargetId = new Map(
    signal.alignmentNeighbors.map((n) => [n.targetId, n.alignment] as const),
  );

  const tensions = signal.alignmentNeighbors
    .filter((n) => isContradiction(n.alignment))
    .sort(
      (a, b) =>
        (ALIGNMENT_WEIGHTS[b.alignment] ?? 0) -
        (ALIGNMENT_WEIGHTS[a.alignment] ?? 0),
    );

  // Group coherence bridges by source doc for a compact summary.
  const coherenceBridgeByDoc = new Map<string, typeof signal.coherenceBridgeLinks>();
  for (const lk of signal.coherenceBridgeLinks) {
    const doc = targetsById.get(lk.pseudoTargetId)?.sourceDocument ?? "?";
    const arr = coherenceBridgeByDoc.get(doc) ?? [];
    arr.push(lk);
    coherenceBridgeByDoc.set(doc, arr);
  }

  const catName = (id: string) =>
    lensCategoryLookup.get(id)?.name ?? id;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--undp-gray)]">
            {getDocMediumLabel(countryConfig, target.sourceDocument)} ·{" "}
            {target.sourceLabel}
          </div>
          <div className="text-xs text-[var(--undp-gray)] mt-0.5">
            {QUADRANT_LABELS[quadrant]} · {budgetBackingLabel(signal.budgetCount)}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[var(--undp-gray)] hover:text-[var(--undp-black)] text-lg leading-none"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <p className="text-[13px] text-[var(--undp-black)] leading-snug mb-3">
        {target.text}
      </p>

      {/* Narrative one-liner — what you are actually seeing, for this dot. */}
      <div className="mb-3 text-[13px] leading-snug bg-[var(--undp-light)] border border-gray-100 rounded px-3 py-2">
        {signal.lensCategoryCount === 0 ? (
          <span className="text-[var(--undp-gray)]">
            Through the <strong className="text-[var(--undp-black)]">{lensLabel}</strong> lens,
            this target has <strong className="text-[var(--undp-black)]">no relevant categories</strong>.
            It sits at the origin by construction — the lens doesn&apos;t apply.
            Switch lens (or enable &ldquo;Hide lens-orphans&rdquo;) to refocus.
          </span>
        ) : (
          <span className="text-[var(--undp-gray)]">
            Through the <strong className="text-[var(--undp-black)]">{lensLabel}</strong> lens,
            this target is primarily about{" "}
            <strong className="text-[var(--undp-black)]">
              {signal.lensPrimary ? catName(signal.lensPrimary) : "—"}
            </strong>
            . It shares a lens category with{" "}
            <strong className="text-[var(--undp-black)]">{signal.coherenceCount}</strong> cross-doc
            policy {signal.coherenceCount === 1 ? "target" : "targets"},{" "}
            <strong className="text-[var(--undp-black)]">{signal.implementationCount}</strong> BTR{" "}
            {signal.implementationCount === 1 ? "action" : "actions"}, and{" "}
            <strong className="text-[var(--undp-black)]">{signal.budgetCount}</strong> BER{" "}
            {signal.budgetCount === 1 ? "programme" : "programmes"} — placing it in{" "}
            <strong className="text-[var(--undp-black)]">{QUADRANT_LABELS[quadrant]}</strong>.
          </span>
        )}
      </div>

      {/* Target's lens footprint as chips */}
      {lensCategoriesForTarget.size > 0 && (
        <div className="mb-3 text-xs">
          <div className="text-[11px] uppercase tracking-wide text-[var(--undp-gray)] mb-1">
            Lens categories ({lensCategoriesForTarget.size})
          </div>
          <div className="flex flex-wrap gap-1">
            {Array.from(lensCategoriesForTarget).map((c) => (
              <CategoryChip key={c} id={c} name={catName(c)} lookup={lensCategoryLookup} />
            ))}
          </div>
        </div>
      )}

      <BridgeMetric
        label="Coherence"
        count={signal.coherenceCount}
        unit={signal.coherenceCount === 1 ? "target" : "targets"}
        suffix="in other docs"
        empty="No cross-doc targets share a lens category with this one."
      >
        {coherenceBridgeByDoc.size > 0 && (
          <p className="text-[11px] text-[var(--undp-gray)] mt-0.5">
            {Array.from(coherenceBridgeByDoc.entries())
              .map(
                ([doc, items]) =>
                  `${getDocMediumLabel(countryConfig, doc)} × ${items.length}`,
              )
              .join(" · ")}
          </p>
        )}
      </BridgeMetric>

      <BridgeMetric
        label="Implementation"
        count={signal.implementationCount}
        unit={signal.implementationCount === 1 ? "BTR action" : "BTR actions"}
        empty="No BTR action shares a lens category with this target."
      >
        {signal.actionBridgeLinks.slice(0, 2).map((lk) => (
          <LinkRow
            key={lk.pseudoTargetId}
            label={lk.label}
            categories={lk.sharedCategories.map(catName)}
            llm={llmActionByPseudoId.get(lk.pseudoTargetId)}
          />
        ))}
        {signal.actionBridgeLinks.length > 2 && (
          <p className="text-[11px] text-[var(--undp-gray)] mt-0.5">
            and {signal.actionBridgeLinks.length - 2} more
          </p>
        )}
      </BridgeMetric>

      <BridgeMetric
        label="Budget"
        count={signal.budgetCount}
        unit={signal.budgetCount === 1 ? "BER programme" : "BER programmes"}
        empty="No BER programme shares a lens category with this target."
      >
        {signal.budgetBridgeLinks.slice(0, 2).map((lk) => (
          <LinkRow
            key={lk.pseudoTargetId}
            label={lk.label}
            categories={lk.sharedCategories.map(catName)}
            llm={llmBudgetByPseudoId.get(lk.pseudoTargetId)}
          />
        ))}
        {signal.budgetBridgeLinks.length > 2 && (
          <p className="text-[11px] text-[var(--undp-gray)] mt-0.5">
            and {signal.budgetBridgeLinks.length - 2} more
          </p>
        )}
      </BridgeMetric>

      <BridgeMetric
        label="Tensions"
        count={signal.tensionCount}
        unit={signal.tensionCount === 1 ? "contradiction" : "contradictions"}
        suffix="(from LLM alignment)"
        tone={signal.tensionCount > 0 ? "warn" : "muted"}
        empty="No contradictions detected."
      >
        {tensions.slice(0, 2).map((n) => {
          const other = targetsById.get(n.targetId);
          return (
            <p
              key={n.targetId}
              className="text-[11px] text-[var(--undp-gray)] mt-0.5"
            >
              {ALIGNMENT_LABELS[n.alignment]} with{" "}
              <span className="text-[var(--undp-black)]">
                {other?.sourceLabel ?? n.targetId}
              </span>
            </p>
          );
        })}
        {tensions.length > 2 && (
          <p className="text-[11px] text-[var(--undp-gray)] mt-0.5">
            and {tensions.length - 2} more
          </p>
        )}
      </BridgeMetric>

      {(signal.coherenceBridgeLinks.length > 2 ||
        signal.budgetBridgeLinks.length > 2 ||
        signal.actionBridgeLinks.length > 2 ||
        tensions.length > 2) && (
        <details className="mt-3 pt-3 border-t border-gray-100">
          <summary className="cursor-pointer text-xs text-[var(--undp-gray)] hover:text-[var(--undp-black)]">
            Show all items
          </summary>
          <div className="mt-2 space-y-3 text-xs">
            {signal.coherenceBridgeLinks.length > 0 && (
              <BridgeList
                title={`Cross-doc policy targets (${signal.coherenceBridgeLinks.length})`}
                items={signal.coherenceBridgeLinks.map((lk) => ({
                  key: lk.pseudoTargetId,
                  primary: lk.label,
                  secondary: getDocMediumLabel(
                    countryConfig,
                    targetsById.get(lk.pseudoTargetId)?.sourceDocument ?? "",
                  ),
                  categories: lk.sharedCategories.map(catName),
                  llm: llmPolicyByTargetId.get(lk.pseudoTargetId),
                }))}
              />
            )}
            {signal.actionBridgeLinks.length > 0 && (
              <BridgeList
                title={`BTR actions (${signal.actionBridgeLinks.length})`}
                items={signal.actionBridgeLinks.map((lk) => ({
                  key: lk.pseudoTargetId,
                  primary: lk.label,
                  secondary: "BTR",
                  categories: lk.sharedCategories.map(catName),
                  llm: llmActionByPseudoId.get(lk.pseudoTargetId),
                }))}
              />
            )}
            {signal.budgetBridgeLinks.length > 0 && (
              <BridgeList
                title={`BER programmes (${signal.budgetBridgeLinks.length})`}
                items={signal.budgetBridgeLinks.map((lk) => ({
                  key: lk.pseudoTargetId,
                  primary: lk.label,
                  secondary: "BER",
                  categories: lk.sharedCategories.map(catName),
                  llm: llmBudgetByPseudoId.get(lk.pseudoTargetId),
                }))}
              />
            )}
            {tensions.length > 0 && (
              <ItemList
                title={`Tensions (${tensions.length})`}
                items={tensions.map((n) => {
                  const other = targetsById.get(n.targetId);
                  return {
                    key: n.targetId,
                    color: ALIGNMENT_COLORS[n.alignment],
                    primary: other?.sourceLabel ?? n.targetId,
                    secondary: `${getDocMediumLabel(countryConfig, other?.sourceDocument ?? "")} · ${ALIGNMENT_LABELS[n.alignment]}`,
                  };
                })}
              />
            )}
          </div>
        </details>
      )}
    </div>
  );
}

function BridgeMetric({
  label,
  count,
  unit,
  suffix,
  empty,
  tone = "default",
  children,
}: {
  label: string;
  count: number;
  unit: string;
  suffix?: string;
  empty: string;
  tone?: "default" | "warn" | "muted";
  children?: React.ReactNode;
}) {
  const countColor =
    tone === "warn"
      ? "text-[#b91c1c]"
      : count === 0
        ? "text-[var(--undp-gray)]"
        : "text-[var(--undp-black)]";
  return (
    <div className="mt-2 pt-2 border-t border-gray-100">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-[var(--undp-gray)]">
          {label}
        </span>
        <span className={`text-base font-semibold ${countColor}`}>
          {count}
          <span className="text-[11px] font-normal text-[var(--undp-gray)] ml-1">
            {unit} {suffix ?? ""}
          </span>
        </span>
      </div>
      {count === 0 ? (
        <p className="text-xs text-[var(--undp-gray)] mt-0.5">{empty}</p>
      ) : (
        <div className="mt-1 space-y-1">{children}</div>
      )}
    </div>
  );
}

function LinkRow({
  label,
  categories,
  llm,
}: {
  label: string;
  categories: string[];
  llm?: AlignmentLevel;
}) {
  return (
    <div className="text-[11px]">
      <div className="text-[var(--undp-black)]">{label}</div>
      <div className="text-[var(--undp-gray)] flex flex-wrap items-center gap-x-2">
        <span>via {categories.slice(0, 3).join(" · ")}</span>
        {llm && (
          <span
            className="inline-flex items-center gap-1"
            title="LLM-assessed pairwise alignment score"
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: ALIGNMENT_COLORS[llm] }}
            />
            {ALIGNMENT_LABELS[llm]} (LLM)
          </span>
        )}
      </div>
    </div>
  );
}

function CategoryChip({
  id,
  name,
  lookup,
}: {
  id: string;
  name: string;
  lookup: Map<string, { color: string; name: string }>;
}) {
  const color = lookup.get(id)?.color ?? "#94a3b8";
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border"
      style={{ borderColor: color, color: "#334155" }}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {name}
    </span>
  );
}

function BridgeList({
  title,
  items,
}: {
  title: string;
  items: {
    key: string;
    primary: string;
    secondary: string;
    categories: string[];
    llm?: AlignmentLevel;
  }[];
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-1">
        {title}
      </div>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.key} className="text-[11px]">
            <div className="text-[var(--undp-black)]">
              <span className="font-medium">{item.primary}</span>
              <span className="text-[var(--undp-gray)]"> · {item.secondary}</span>
            </div>
            <div className="text-[var(--undp-gray)]">
              via {item.categories.slice(0, 4).join(" · ")}
              {item.llm && (
                <>
                  {" · "}
                  <span
                    className="inline-flex items-center gap-1"
                    title="LLM-assessed pairwise alignment"
                  >
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: ALIGNMENT_COLORS[item.llm] }}
                    />
                    {ALIGNMENT_LABELS[item.llm]} (LLM)
                  </span>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Small building blocks ─────────────────────────────────────────────
function ItemList({
  title,
  items,
}: {
  title: string;
  items: { key: string; color: string; primary: string; secondary: string }[];
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-1">
        {title}
      </div>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.key} className="flex items-start gap-2 text-xs text-[var(--undp-black)]">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <span className="flex-1">
              <span className="font-medium">{item.primary}</span>
              <span className="text-[var(--undp-gray)]">
                {" · "}
                {item.secondary}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

