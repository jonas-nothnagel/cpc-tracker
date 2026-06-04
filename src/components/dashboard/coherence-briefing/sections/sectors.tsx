"use client";

/**
 * Sectors — answers "where does misalignment concentrate?" with a
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
import { useTranslations } from "next-intl";
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
  const t = useTranslations("briefing.sectors");
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
    t,
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
      eyebrow={t("eyebrow")}
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
            {t("noTaxonomy")}
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
                {t("showAll", { count: mergedRows.length })}
              </button>
            )}
            {showAll && mergedRows.length > VISIBLE_ROWS_DEFAULT && (
              <button
                type="button"
                onClick={() => setShowAll(false)}
                className="mt-3 text-[11px] text-[var(--undp-gray)] hover:text-[var(--undp-black)] underline underline-offset-2"
              >
                {t("collapseToTop", { count: VISIBLE_ROWS_DEFAULT })}
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
  const t = useTranslations("briefing.sectors");
  const activeLens = activeLensId ?? availableLenses[0]?.id;
  const FILTER_OPTIONS: ReadonlyArray<{ value: WheelFilter; label: string }> = [
    { value: "tensions", label: t("filter.misaligned") },
    { value: "alignments", label: t("filter.aligned") },
    { value: "all", label: t("filter.both") },
  ];
  return (
    <div className="flex flex-col gap-3">
      {availableLenses.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)] mr-1">
            {t("groupBy")}
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
          {t("show")}
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
  const t = useTranslations("briefing.sectors");
  return (
    <div className="grid grid-cols-[1fr_4.25rem_4.25rem] items-center gap-3 px-1 pb-1 mb-1 text-[10px] uppercase tracking-wider text-[var(--undp-gray)]">
      <span>{t("col.sector")}</span>
      <button
        type="button"
        onClick={() => onSort("alignment")}
        className={`text-left ${
          sortMode === "alignment"
            ? "text-[var(--undp-black)] underline underline-offset-4"
            : "hover:text-[var(--undp-black)]"
        }`}
      >
        {t("col.aligned")}
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
        {t("col.misaligned")}
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
  t,
}: {
  concentration: ConcentrationStat;
  lensLabel: string | null;
  t: ReturnType<typeof useTranslations<"briefing.sectors">>;
}): ConcentrationSentence {
  const nounStyle = lensLabel === "GLOBE" ? "category" : "sector";
  const noun = t(`noun.${nounStyle}.singular`);
  const nounPlural = t(`noun.${nounStyle}.plural`);
  const { populatedSectors, totalFlags, topNames, share } = concentration;
  if (totalFlags === 0 || populatedSectors === 0) {
    return {
      headline: t("concentration.emptyHeadline", { noun }),
      body: t("concentration.emptyBody", { noun }),
    };
  }
  if (topNames.length === 0) {
    return {
      headline: t("concentration.spreadHeadline", {
        sectors: populatedSectors,
        nounPlural,
      }),
      body: t("concentration.spreadBody", {
        total: totalFlags,
        sectors: populatedSectors,
        noun,
        nounPlural,
      }),
    };
  }
  const sharePct = Math.round(share * 100);
  const list = formatList(topNames, t);
  if (topNames.length === 1) {
    return {
      headline: t("concentration.singleHeadline", {
        name: topNames[0],
        pct: sharePct,
      }),
      body: t("concentration.singleBody", {
        total: totalFlags,
        sectors: populatedSectors,
        nounPlural,
        name: topNames[0],
        pct: sharePct,
      }),
    };
  }
  if (topNames.length === populatedSectors) {
    return {
      headline: t("concentration.everyHeadline", { noun }),
      body: t("concentration.everyBody", {
        total: totalFlags,
        sectors: populatedSectors,
        nounPlural,
        list,
      }),
    };
  }
  return {
    headline: t("concentration.topHeadline", {
      count: topNames.length,
      sectors: populatedSectors,
      nounPlural,
    }),
    body: t("concentration.topBody", {
      pct: sharePct,
      total: totalFlags,
      list,
    }),
  };
}

function formatList(
  items: string[],
  t: ReturnType<typeof useTranslations<"briefing.sectors">>,
): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return t("listJoinTwo", { a: items[0], b: items[1] });
  return t("listJoinMany", {
    head: items.slice(0, -1).join(", "),
    last: items[items.length - 1],
  });
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
  const t = useTranslations("briefing.sectors");
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
        aria-label={t("rowAriaLabel", {
          name: row.categoryName,
          flagged: row.tensionCount,
          aligned: row.alignmentCount,
        })}
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
            {t("primaryCount", { count: row.targetCount })}
            {hasPool && row.relevantOnlyCount !== null
              ? " · " + t("relevantCount", { count: row.relevantOnlyCount })
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
