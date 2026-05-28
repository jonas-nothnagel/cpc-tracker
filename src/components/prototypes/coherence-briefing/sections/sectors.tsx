"use client";

/**
 * Sectors — answers "where does the friction concentrate?" with a
 * comparative view across the top sectors under the active lens. The
 * lens switcher (GLOBE / IPCC / Country sectors) is the first-class
 * control on this slide, surfaced under the headline so a policymaker
 * can re-frame the concentration question by category system.
 *
 * Row list caps to the top 8 by default; the rest hide behind a "Show
 * all" toggle. Each row pairs the alignment and tension density bars so
 * one sector's polarity reads at a glance; clicking opens the sector
 * drawer with the synthesis block and example pairs.
 */

import { useMemo, useState } from "react";
import { SlideFrame } from "../slide-frame";
import {
  type ConcentrationStat,
  type SectorAlignment,
  type SectorTension,
} from "@/lib/coherence-briefing";
import type { SectorSynthesis } from "@/types";
import type { LensId, LensOption } from "../lens";
import type { WheelFilter } from "../centerpiece/wheel";

export const SECTORS_SECTION_ID = "sectors";

export type SectorSortMode = "tension" | "alignment";

const VISIBLE_ROWS_DEFAULT = 8;

export function SectorsSection({
  sectorRows,
  sectorAlignments,
  sectorSyntheses,
  taxonomyType,
  concentration,
  lensLabel,
  availableLenses,
  activeLensId,
  onLensChange,
  filter,
  onFilterChange,
  onOpenSector,
  onHoverSector,
}: {
  sectorRows: SectorTension[];
  sectorAlignments: SectorAlignment[];
  sectorSyntheses: Map<string, SectorSynthesis>;
  concentration: ConcentrationStat;
  lensLabel: string | null;
  taxonomyType: string;
  availableLenses: LensOption[];
  activeLensId: LensId | null;
  onLensChange: (id: LensId) => void;
  filter: WheelFilter;
  onFilterChange: (f: WheelFilter) => void;
  onOpenSector: (s: {
    categoryId: string;
    categoryName: string;
    taxonomyType: string;
  }) => void;
  onHoverSector?: (categoryId: string | null) => void;
}) {
  const [sortMode, setSortMode] = useState<SectorSortMode>("tension");
  const [showAll, setShowAll] = useState(false);

  const alignmentByCategory = useMemo(
    () => new Map(sectorAlignments.map((s) => [s.categoryId, s])),
    [sectorAlignments],
  );

  const mergedRows = useMemo<MergedSectorRow[]>(() => {
    const rows: MergedSectorRow[] = sectorRows.map((tension) => {
      const aligned = alignmentByCategory.get(tension.categoryId);
      const synth = sectorSyntheses.get(
        `${taxonomyType}:${tension.categoryId}`,
      );
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
  const visibleRows = showAll
    ? mergedRows
    : mergedRows.slice(0, VISIBLE_ROWS_DEFAULT);
  const hiddenCount = mergedRows.length - visibleRows.length;

  return (
    <SlideFrame
      id={SECTORS_SECTION_ID}
      eyebrow="Where does the friction concentrate?"
      headline={sentence.headline}
      body={sentence.body}
      controls={
        <LensChipRow
          availableLenses={availableLenses}
          activeLensId={activeLensId}
          onLensChange={onLensChange}
          filter={filter}
          onFilterChange={onFilterChange}
        />
      }
      evidence={
        mergedRows.length === 0 ? (
          <p className="text-sm italic text-[var(--undp-gray)]">
            No sector taxonomy is available for this country.
          </p>
        ) : (
          <div className="border-y border-gray-200 py-3">
            <SectorColumnHeader sortMode={sortMode} onSort={setSortMode} />
            <ul
              className="divide-y divide-gray-100"
              onMouseLeave={() => onHoverSector?.(null)}
            >
              {visibleRows.map((row) => (
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
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="mt-3 text-[11px] text-[var(--undp-black)] hover:text-[var(--undp-black)] underline underline-offset-2"
              >
                Show all {mergedRows.length.toLocaleString()} sectors →
              </button>
            )}
            {showAll && mergedRows.length > VISIBLE_ROWS_DEFAULT && (
              <button
                type="button"
                onClick={() => setShowAll(false)}
                className="mt-3 text-[11px] text-[var(--undp-gray)] hover:text-[var(--undp-black)] underline underline-offset-2"
              >
                Collapse to top {VISIBLE_ROWS_DEFAULT}
              </button>
            )}
          </div>
        )
      }
    />
  );
}

interface MergedSectorRow {
  categoryId: string;
  categoryName: string;
  tensionCount: number;
  alignmentCount: number;
  targetCount: number;
  relevantOnlyCount: number | null;
}

function LensChipRow({
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
  const activeLens = activeLensId ?? availableLenses[0]?.id;
  const FILTER_OPTIONS: ReadonlyArray<{ value: WheelFilter; label: string }> = [
    { value: "tensions", label: "Flagged" },
    { value: "alignments", label: "Aligned" },
    { value: "all", label: "Both" },
  ];
  return (
    <div className="flex flex-col gap-3">
      {availableLenses.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)] mr-1">
            Group by:
          </span>
          {availableLenses.map((opt) => {
            const active = activeLens === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onLensChange(opt.id)}
                aria-pressed={active}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                  active
                    ? "bg-[var(--undp-black)] text-white border-[var(--undp-black)]"
                    : "border-gray-300 text-[var(--undp-gray)] hover:text-[var(--undp-black)] hover:border-gray-400"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)] mr-1">
          Show:
        </span>
        {FILTER_OPTIONS.map((opt) => {
          const active = filter === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onFilterChange(opt.value)}
              aria-pressed={active}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                active
                  ? "bg-[var(--undp-black)] text-white border-[var(--undp-black)]"
                  : "border-gray-300 text-[var(--undp-gray)] hover:text-[var(--undp-black)] hover:border-gray-400"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
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
      headline: `No flagged pairs grouped by ${noun} yet.`,
      body: `Either the pipeline has not flagged any pairs touching a primary-classified ${noun}, or the country has no ${noun} taxonomy configured.`,
    };
  }
  if (topNames.length === 0) {
    return {
      headline: `Flagged pairs spread across ${populatedSectors} ${nounPlural}.`,
      body: `${totalFlags.toLocaleString()} flagged pairs land across ${populatedSectors} ${nounPlural} with no single ${noun} dominating.`,
    };
  }
  const sharePct = Math.round(share * 100);
  const list = formatList(topNames);
  if (topNames.length === 1) {
    return {
      headline: `${topNames[0]} carries ${sharePct}% of flagged pairs.`,
      body: `${totalFlags.toLocaleString()} flagged pairs land across ${populatedSectors} ${nounPlural}; ${topNames[0]} alone holds ${sharePct}%.`,
    };
  }
  if (topNames.length === populatedSectors) {
    return {
      headline: `Flagged pairs touch every ${noun}.`,
      body: `${totalFlags.toLocaleString()} flagged pairs spread across all ${populatedSectors} ${nounPlural}; the heaviest are ${list}.`,
    };
  }
  return {
    headline: `Friction concentrates in ${topNames.length} of ${populatedSectors} ${nounPlural}.`,
    body: `${sharePct}% of the ${totalFlags.toLocaleString()} flagged pairs land on ${list}. Click a row for the underlying pairs.`,
  };
}

function formatList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

const DOT_TENSION = "#dc2626";
const DOT_ALIGN = "#196127";
const DOT_EMPTY = "#e5e7eb";

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
