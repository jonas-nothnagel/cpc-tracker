"use client";

/**
 * Sectors section — Section 2 of the findings home.
 *
 * Paragraph claim about how concentrated (or spread out) the friction is
 * across sectors, then a compact intensity-row list. Each row shows both
 * the tension density and alignment density side by side, plus a small
 * "M primary · N relevant" caption derived from the sector synthesis
 * pool composition. Hover previews the wheel focus on that sector; click
 * opens the sector drawer.
 */

import { useMemo, useState } from "react";
import {
  type ConcentrationStat,
  type HeadlineVerdict,
  type SectorAlignment,
  type SectorTension,
} from "@/lib/coherence-briefing";
import type { CountryConfig, SectorSynthesis } from "@/types";
import type { LensId, LensOption } from "../lens";
import type { WheelFilter } from "../centerpiece/wheel";

export const SECTORS_SECTION_ID = "sectors";

const HEADLINE_SERIF =
  "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif";

export type SectorSortMode = "tension" | "alignment";

export function SectorsSection({
  sectorRows,
  sectorAlignments,
  sectorSyntheses,
  taxonomyType,
  concentration,
  verdict,
  lensLabel,
  availableLenses,
  activeLensId,
  onLensChange,
  filter,
  onFilterChange,
  countryConfig,
  onOpenSector,
  onHoverSector,
}: {
  sectorRows: SectorTension[];
  sectorAlignments: SectorAlignment[];
  sectorSyntheses: Map<string, SectorSynthesis>;
  concentration: ConcentrationStat;
  verdict: HeadlineVerdict;
  lensLabel: string | null;
  taxonomyType: string;
  availableLenses: LensOption[];
  activeLensId: LensId | null;
  onLensChange: (id: LensId) => void;
  filter: WheelFilter;
  onFilterChange: (f: WheelFilter) => void;
  countryConfig: CountryConfig | null;
  onOpenSector: (s: {
    categoryId: string;
    categoryName: string;
    taxonomyType: string;
  }) => void;
  onHoverSector?: (categoryId: string | null) => void;
}) {
  const [sortMode, setSortMode] = useState<SectorSortMode>("tension");

  // Merge tension + alignment + synthesis-derived pool counts into one row
  // shape. Both density arrays carry one entry per category in the same
  // order; the merger here keeps the sort stable.
  const alignmentByCategory = useMemo(
    () => new Map(sectorAlignments.map((s) => [s.categoryId, s])),
    [sectorAlignments],
  );

  const mergedRows = useMemo<MergedSectorRow[]>(() => {
    const rows: MergedSectorRow[] = sectorRows.map((tension) => {
      const aligned = alignmentByCategory.get(tension.categoryId);
      const synth = sectorSyntheses.get(`${taxonomyType}:${tension.categoryId}`);
      const pool = synth?.pool_composition ?? null;
      return {
        categoryId: tension.categoryId,
        categoryName: tension.categoryName,
        tensionCount: tension.tensionCount,
        alignmentCount: aligned?.alignmentCount ?? 0,
        targetCount: tension.targetCount,
        relevantOnlyCount: pool?.relevant_only_count ?? null,
      };
    });
    rows.sort((a, b) => {
      if (sortMode === "tension") {
        if (b.tensionCount !== a.tensionCount) {
          return b.tensionCount - a.tensionCount;
        }
        return b.alignmentCount - a.alignmentCount;
      }
      if (b.alignmentCount !== a.alignmentCount) {
        return b.alignmentCount - a.alignmentCount;
      }
      return b.tensionCount - a.tensionCount;
    });
    return rows;
  }, [sectorRows, alignmentByCategory, sectorSyntheses, taxonomyType, sortMode]);

  const sentence = composeConcentrationSentence({
    concentration,
    lensLabel,
  });
  const maxTension = mergedRows.reduce(
    (m, r) => (r.tensionCount > m ? r.tensionCount : m),
    0,
  );
  const maxAlignment = mergedRows.reduce(
    (m, r) => (r.alignmentCount > m ? r.alignmentCount : m),
    0,
  );

  return (
    <section
      id={SECTORS_SECTION_ID}
      className="scroll-mt-24 pt-2"
      aria-labelledby={`${SECTORS_SECTION_ID}-heading`}
    >
      <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--undp-gray)] mb-2">
        Where do flagged pairs concentrate?
      </p>
      <p className="text-[13px] text-[var(--undp-gray)] mb-4">
        {composeStatsLine({ verdict, concentration, lensLabel })}
      </p>
      <h2
        id={`${SECTORS_SECTION_ID}-heading`}
        className="text-[28px] sm:text-[32px] leading-[1.15] text-[var(--undp-black)] font-medium mb-4"
        style={{ fontFamily: HEADLINE_SERIF }}
      >
        {sentence.headline}
      </h2>
      <p className="text-[15px] leading-relaxed text-[var(--undp-black)] max-w-prose mb-4">
        {sentence.body}
      </p>
      <SectorControls
        availableLenses={availableLenses}
        activeLensId={activeLensId}
        onLensChange={onLensChange}
        filter={filter}
        onFilterChange={onFilterChange}
      />

      {mergedRows.length === 0 ? (
        <p className="text-sm italic text-[var(--undp-gray)]">
          No sector taxonomy is available for this country.
        </p>
      ) : (
        <>
          <SectorColumnHeader sortMode={sortMode} onSort={setSortMode} />
          <ul
            className="divide-y divide-gray-100 border-y border-gray-100"
            onMouseLeave={() => onHoverSector?.(null)}
          >
            {mergedRows.map((row) => (
              <SectorRow
                key={row.categoryId}
                row={row}
                maxTension={maxTension}
                maxAlignment={maxAlignment}
                onHover={onHoverSector}
                onSelect={() =>
                  onOpenSector({
                    categoryId: row.categoryId,
                    categoryName: row.categoryName,
                    taxonomyType,
                  })
                }
              />
            ))}
          </ul>
        </>
      )}
      <span data-config-ref className="sr-only">
        {countryConfig?.docProvenance ? "" : ""}
      </span>
    </section>
  );
}

interface MergedSectorRow {
  categoryId: string;
  categoryName: string;
  tensionCount: number;
  alignmentCount: number;
  targetCount: number;
  /** From sector-synthesis pool_composition.relevant_only_count, null if no synthesis. */
  relevantOnlyCount: number | null;
}

function SectorControls({
  availableLenses,
  activeLensId,
  onLensChange,
  filter,
  onFilterChange,
}: {
  availableLenses: LensOption[];
  activeLensId: LensId | null;
  onLensChange: (id: LensId) => void;
  filter: WheelFilter;
  onFilterChange: (f: WheelFilter) => void;
}) {
  const lensValue = activeLensId ?? availableLenses[0]?.id ?? "";
  const FILTER_OPTIONS: ReadonlyArray<{ value: WheelFilter; label: string }> = [
    { value: "tensions", label: "Flagged only" },
    { value: "alignments", label: "Alignments only" },
    { value: "all", label: "Both" },
  ];
  return (
    <div className="mb-6 flex items-center gap-3 flex-wrap text-[12px]">
      {availableLenses.length > 0 && (
        <label className="inline-flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)]">
            Lens
          </span>
          <select
            value={lensValue}
            onChange={(e) => onLensChange(e.target.value as LensId)}
            disabled={availableLenses.length <= 1}
            className="px-2 py-1 border border-gray-300 rounded bg-white disabled:bg-gray-50 disabled:text-[var(--undp-gray)] focus:outline-none focus:ring-1 focus:ring-[var(--undp-black)] focus:border-[var(--undp-black)]"
          >
            {availableLenses.map((opt) => (
              <option key={opt.id} value={opt.id}>
                By {opt.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="inline-flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)]">
          Show
        </span>
        <select
          value={filter}
          onChange={(e) => onFilterChange(e.target.value as WheelFilter)}
          className="px-2 py-1 border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-[var(--undp-black)] focus:border-[var(--undp-black)]"
        >
          {FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function SectorColumnHeader({
  sortMode,
  onSort,
}: {
  sortMode: SectorSortMode;
  onSort: (m: SectorSortMode) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_4.25rem_4.25rem] items-center gap-3 px-1 pb-1 mb-1 text-[10px] uppercase tracking-wider text-[var(--undp-gray)]">
      <span>Sector</span>
      <button
        type="button"
        onClick={() => onSort("alignment")}
        className={`text-left ${
          sortMode === "alignment"
            ? "text-[var(--undp-black)] underline underline-offset-4"
            : "hover:text-[var(--undp-black)]"
        }`}
      >
        Aligned
      </button>
      <button
        type="button"
        onClick={() => onSort("tension")}
        className={`text-left ${
          sortMode === "tension"
            ? "text-[var(--undp-black)] underline underline-offset-4"
            : "hover:text-[var(--undp-black)]"
        }`}
      >
        Flagged
      </button>
    </div>
  );
}

function composeStatsLine({
  verdict,
  concentration,
  lensLabel,
}: {
  verdict: HeadlineVerdict;
  concentration: ConcentrationStat;
  lensLabel: string | null;
}): string {
  const aligned = verdict.alignmentPairs.toLocaleString();
  const flagged = verdict.tensionPairs.toLocaleString();
  const noun = lensLabel === "GLOBE" ? "biodiversity categories" : "sectors";
  const n = concentration.populatedSectors;
  if (n === 0) {
    return `${aligned} alignments and ${flagged} possible misalignments scored.`;
  }
  return `${aligned} alignments and ${flagged} possible misalignments across ${n} ${noun}.`;
}

interface ConcentrationSentence {
  headline: string;
  body: string;
}

function composeConcentrationSentence({
  concentration,
  lensLabel,
}: {
  concentration: ConcentrationStat;
  lensLabel: string | null;
}): ConcentrationSentence {
  const { noun, nounPlural } =
    lensLabel === "GLOBE"
      ? { noun: "category", nounPlural: "categories" }
      : { noun: "sector", nounPlural: "sectors" };
  const { populatedSectors, totalFlags, topNames, share } = concentration;
  if (totalFlags === 0 || populatedSectors === 0) {
    return {
      headline: `No possible misalignments grouped by ${noun}.`,
      body: `Either the pipeline has not flagged any pairs touching a primary-classified ${noun}, or the country has no ${noun} taxonomy configured.`,
    };
  }
  if (topNames.length === 0) {
    return {
      headline: "Possible misalignments are widely spread.",
      body: `${totalFlags.toLocaleString()} flagged pairs touch ${populatedSectors} ${nounPlural}, with no single ${noun} dominating.`,
    };
  }
  const sharePct = Math.round(share * 100);
  const headline =
    topNames.length === populatedSectors
      ? `Possible misalignments touch every ${noun}.`
      : `Friction concentrates in ${topNames.length} of ${populatedSectors} ${nounPlural}.`;
  const list = formatList(topNames);
  const remaining = populatedSectors - topNames.length;
  const remainingWord = remaining === 1 ? noun : nounPlural;
  const body =
    topNames.length === populatedSectors
      ? `${totalFlags.toLocaleString()} flagged pairs spread across ${populatedSectors} ${nounPlural}; the heaviest are ${list}.`
      : `${sharePct}% of the ${totalFlags.toLocaleString()} flagged pairs land on ${list}. The rest are spread across the other ${remaining} ${remainingWord}.`;
  return { headline, body };
}

function formatList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

const DOT_TENSION = "#dc2626"; // red, flagged
const DOT_ALIGN = "#196127"; // green, high
const DOT_EMPTY = "#e5e7eb"; // gray-200 — bar track

function SectorRow({
  row,
  maxTension,
  maxAlignment,
  onHover,
  onSelect,
}: {
  row: MergedSectorRow;
  maxTension: number;
  maxAlignment: number;
  onHover?: (categoryId: string | null) => void;
  onSelect: () => void;
}) {
  const isMuted = row.tensionCount === 0 && row.alignmentCount === 0;
  const hasPool = row.relevantOnlyCount !== null;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        onMouseEnter={() => onHover?.(row.categoryId)}
        onFocus={() => onHover?.(row.categoryId)}
        className="w-full text-left grid grid-cols-[1fr_4.25rem_4.25rem] items-center gap-3 px-1 py-2.5 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none transition-colors"
        aria-label={`${row.categoryName}: ${row.tensionCount} flagged, ${row.alignmentCount} aligned`}
      >
        <div className="min-w-0">
          <p
            className={`text-sm leading-snug truncate ${
              isMuted
                ? "text-[var(--undp-gray)]/70"
                : "text-[var(--undp-black)] font-medium"
            }`}
            title={row.categoryName}
          >
            {row.categoryName}
          </p>
          <p className="text-[10px] text-[var(--undp-gray)] tabular-nums leading-tight mt-0.5">
            {row.targetCount.toLocaleString()} primary
            {hasPool && row.relevantOnlyCount !== null
              ? ` · ${row.relevantOnlyCount.toLocaleString()} relevant`
              : ""}
          </p>
        </div>
        <SeverityBar
          color={DOT_ALIGN}
          count={row.alignmentCount}
          max={maxAlignment}
        />
        <SeverityBar
          color={DOT_TENSION}
          count={row.tensionCount}
          max={maxTension}
        />
      </button>
    </li>
  );
}

/**
 * Replaces the 5-dot capped indicator with a continuous proportional bar.
 * Width = count / columnMax. The column max is computed across the
 * visible sectors per column so aligned and flagged each have their own
 * dynamic range, otherwise a country with high alignment counts (the
 * common case) would visually flatten the flagged column to nothing.
 *
 * Per round-2 feedback: a sector with 2 flagged pairs and one with 500
 * looked identical under the 5-dot scheme because non-zero counts
 * collapsed to "at least one filled dot". The bar scales linearly so the
 * difference reads at a glance; the printed count below stays for the
 * exact number.
 */
function SeverityBar({
  color,
  count,
  max,
}: {
  color: string;
  count: number;
  max: number;
}) {
  const fillPct = max > 0 ? Math.min(100, (count / max) * 100) : 0;
  // Min visible width when count > 0 so a single-pair sector still draws
  // something distinguishable from an empty sector.
  const displayPct = count > 0 ? Math.max(fillPct, 4) : 0;
  return (
    <div className="flex flex-col items-start gap-1 w-full">
      <span
        aria-hidden="true"
        className="block h-1.5 w-full rounded-full overflow-hidden"
        style={{ backgroundColor: DOT_EMPTY }}
      >
        <span
          className="block h-full rounded-full"
          style={{
            width: `${displayPct}%`,
            backgroundColor: count > 0 ? color : "transparent",
          }}
        />
      </span>
      <span
        className={`text-[11px] tabular-nums leading-none ${
          count === 0
            ? "text-[var(--undp-gray)]/60"
            : "text-[var(--undp-black)] font-medium"
        }`}
      >
        {count.toLocaleString()}
      </span>
    </div>
  );
}
