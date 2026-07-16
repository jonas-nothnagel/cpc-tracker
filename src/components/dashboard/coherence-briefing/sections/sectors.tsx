"use client";

/**
 * Sectors — answers "where does policy ambition sit under this lens, and how
 * flag-prone is each area?". Each row leads with the coverage magnitude (how many
 * targets are primary-classified to the sector) and pairs it with a size-robust
 * flagged share (the fraction of that sector's reviewed relationships that are a
 * possible misalignment). The flagged share replaces the old raw aligned/misaligned
 * pair counts, which scaled with sector size and were not comparable across rows.
 *
 * The lens switcher (GLOBE / IPCC / Country sectors / GGA) is the first-class
 * control, so a policymaker can re-frame coverage by category system. Row list caps
 * to the top 8 by default; the rest hide behind a "Show all" toggle. Clicking a row
 * opens the sector drawer with the synthesis block and example pairs.
 */

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { SlideFrame } from "../slide-frame";
import { TourButton } from "../tour/tour-button";
import {
  type CoverageConcentrationStat,
  type SectorCoherenceShareSummary,
  type SectorTension,
} from "@/lib/coherence-briefing";
import type { SectorSynthesis } from "@/types";
import type { LensId, LensOption } from "../lens";
import type { WheelFilter } from "../centerpiece/wheel";

export const SECTORS_SECTION_ID = "sectors";

type SectorSortMode = "coverage" | "flagShare";

const VISIBLE_ROWS_DEFAULT = 8;

// Neutral slate for the coverage magnitude (a count, not a verdict); red for the
// possible-misalignment share; light track behind both bars.
const BAR_COVERAGE = "#4b5563";
const BAR_FLAG = "#dc2626";
const BAR_TRACK = "#e5e7eb";
const MID_TICK = "#1f2937";

const GRID = "grid grid-cols-[1fr_5rem_5rem] items-center gap-3";

export function SectorsSection({
  sectorRows,
  sectorShares,
  sectorSyntheses,
  taxonomyType,
  coverageConcentration,
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
  sectorShares: SectorCoherenceShareSummary | null;
  sectorSyntheses: Map<string, SectorSynthesis>;
  coverageConcentration: CoverageConcentrationStat;
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
  const [sortMode, setSortMode] = useState<SectorSortMode>("coverage");
  const [showAll, setShowAll] = useState(false);

  const shareByCategory = sectorShares?.byCategory ?? null;
  const maxShare = sectorShares?.maxShare ?? 0;
  const midShare = sectorShares?.mid ?? 0;

  const mergedRows = useMemo<MergedSectorRow[]>(() => {
    const rows: MergedSectorRow[] = sectorRows.map((row) => {
      const share = shareByCategory?.get(row.categoryId) ?? null;
      const synth = sectorSyntheses.get(`${taxonomyType}:${row.categoryId}`);
      const pool = synth?.pool_composition ?? null;
      return {
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        targetCount: row.targetCount,
        flaggedShare: share?.flaggedShare ?? null,
        flaggedPairs: share?.flaggedPairs ?? 0,
        reviewedPairs: share?.reviewedPairs ?? 0,
        relevantOnlyCount: pool?.relevant_only_count ?? null,
      };
    });
    rows.sort((a, b) => sortRows(a, b, sortMode));
    return rows;
  }, [sectorRows, shareByCategory, sectorSyntheses, taxonomyType, sortMode]);

  const sentence = composeCoverageSentence({
    coverageConcentration,
    mergedRows,
    midShare,
    lensLabel,
    taxonomyType,
    t,
  });
  const maxTargetCount = mergedRows.reduce(
    (m, r) => (r.targetCount > m ? r.targetCount : m),
    0,
  );
  const visibleRows = showAll
    ? mergedRows
    : mergedRows.slice(0, VISIBLE_ROWS_DEFAULT);
  const hiddenCount = mergedRows.length - visibleRows.length;

  return (
    <SlideFrame
      id={SECTORS_SECTION_ID}
      headline={sentence.headline}
      body={sentence.body}
      tourButton={
        mergedRows.length > 0 ? (
          <TourButton tourId="sectors" scopeId={SECTORS_SECTION_ID} />
        ) : undefined
      }
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
              data-tour="sector-rows"
            >
              {visibleRows.map((row) => (
                <SectorRow
                  key={row.categoryId}
                  row={row}
                  maxTargetCount={maxTargetCount}
                  maxShare={maxShare}
                  midShare={midShare}
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
  /** Coverage: targets primary-classified to this sector under the active lens. */
  targetCount: number;
  /** flaggedPairs / reviewedPairs, or null when no reviewed pair touches the sector. */
  flaggedShare: number | null;
  flaggedPairs: number;
  reviewedPairs: number;
  relevantOnlyCount: number | null;
}

/** Coverage-first by default; nulls (no reviewed pairs) always sort last on flag share. */
function sortRows(
  a: MergedSectorRow,
  b: MergedSectorRow,
  mode: SectorSortMode,
): number {
  if (mode === "flagShare") {
    const sa = a.flaggedShare;
    const sb = b.flaggedShare;
    if (sa === null && sb === null) return b.targetCount - a.targetCount;
    if (sa === null) return 1;
    if (sb === null) return -1;
    if (sb !== sa) return sb - sa;
    return b.targetCount - a.targetCount;
  }
  if (b.targetCount !== a.targetCount) return b.targetCount - a.targetCount;
  return (b.flaggedShare ?? -1) - (a.flaggedShare ?? -1);
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
    <div className="flex flex-col gap-3" data-tour="sector-lenses">
      {availableLenses.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] uppercase tracking-wider text-[var(--undp-gray)] mr-1">
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
                title={opt.tooltip}
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
        <span className="text-[11px] uppercase tracking-wider text-[var(--undp-gray)] mr-1">
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
    <div
      className={`${GRID} px-1 pb-1 mb-1 text-[11px] uppercase tracking-wider text-[var(--undp-gray)]`}
      data-tour="sector-columns"
    >
      <span>{t("col.sector")}</span>
      <button
        type="button"
        onClick={() => onSort("coverage")}
        className={`text-left ${
          sortMode === "coverage"
            ? "text-[var(--undp-black)] underline underline-offset-4"
            : "hover:text-[var(--undp-black)]"
        }`}
      >
        {t("col.targets")}
      </button>
      <button
        type="button"
        onClick={() => onSort("flagShare")}
        className={`text-left ${
          sortMode === "flagShare"
            ? "text-[var(--undp-black)] underline underline-offset-4"
            : "hover:text-[var(--undp-black)]"
        }`}
      >
        {t("col.flaggedShare")}
      </button>
    </div>
  );
}

interface CoverageSentence {
  headline: string;
  body: string;
}

function composeCoverageSentence({
  coverageConcentration,
  mergedRows,
  midShare,
  lensLabel,
  taxonomyType,
  t,
}: {
  coverageConcentration: CoverageConcentrationStat;
  mergedRows: MergedSectorRow[];
  midShare: number;
  lensLabel: string | null;
  taxonomyType: string;
  t: ReturnType<typeof useTranslations<"briefing.sectors">>;
}): CoverageSentence {
  // GGA themes are not "sectors"; the globe lens reads "category". Anything else
  // keeps the generic "sector" noun.
  const nounStyle =
    taxonomyType === "gga"
      ? "theme"
      : lensLabel === "GLOBE"
        ? "category"
        : "sector";
  const noun = t(`noun.${nounStyle}.singular`);
  const nounPlural = t(`noun.${nounStyle}.plural`);
  const { populatedSectors, totalTargets, topNames, share } =
    coverageConcentration;

  if (totalTargets === 0 || populatedSectors === 0) {
    return {
      headline: t("coverage.emptyHeadline", { noun }),
      body: t("coverage.emptyBody", { noun }),
    };
  }

  const sharePct = Math.round(share * 100);
  const list = formatList(topNames, t);
  let headline: string;
  if (topNames.length === 1) {
    headline = t("coverage.singleHeadline", { name: topNames[0], pct: sharePct });
  } else if (topNames.length >= populatedSectors) {
    headline = t("coverage.everyHeadline", {
      sectors: populatedSectors,
      nounPlural,
      name: topNames[0],
    });
  } else {
    headline = t("coverage.topHeadline", { list, pct: sharePct });
  }

  return { headline, body: composeFlagBody({ mergedRows, midShare, nounPlural, t }) };
}

/**
 * Honest flag-share body: states the corpus range and only names a leading sector
 * when its share sits materially above the corpus average; when shares cluster it
 * reports them as broadly similar rather than forcing a "winner".
 */
function composeFlagBody({
  mergedRows,
  midShare,
  nounPlural,
  t,
}: {
  mergedRows: MergedSectorRow[];
  midShare: number;
  nounPlural: string;
  t: ReturnType<typeof useTranslations<"briefing.sectors">>;
}): string {
  const shares = mergedRows
    .map((r) => r.flaggedShare)
    .filter((s): s is number => s !== null);
  if (shares.length === 0) return t("flag.none");

  const minPct = Math.round(Math.min(...shares) * 100);
  const maxPct = Math.round(Math.max(...shares) * 100);
  const midPct = Math.round(midShare * 100);

  if (maxPct - minPct <= 2) {
    return t("flag.uniform", { mid: midPct, nounPlural });
  }

  let peak: MergedSectorRow | null = null;
  for (const r of mergedRows) {
    if (r.flaggedShare === null) continue;
    if (peak === null || r.flaggedShare > (peak.flaggedShare ?? 0)) peak = r;
  }
  if (peak && maxPct - midPct >= 5) {
    return t("flag.rangeWithPeak", {
      min: minPct,
      max: maxPct,
      mid: midPct,
      nounPlural,
      name: peak.categoryName,
    });
  }
  return t("flag.range", { min: minPct, max: maxPct, mid: midPct, nounPlural });
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

function SectorRow({
  row,
  maxTargetCount,
  maxShare,
  midShare,
  onHover,
  onSelect,
}: {
  row: MergedSectorRow;
  maxTargetCount: number;
  maxShare: number;
  midShare: number;
  onHover?: (categoryId: string | null) => void;
  onSelect: () => void;
}) {
  const t = useTranslations("briefing.sectors");
  const isMuted = row.targetCount === 0;
  const hasPool = row.relevantOnlyCount !== null;
  const sharePct =
    row.flaggedShare !== null ? Math.round(row.flaggedShare * 100) : null;
  const flagAria =
    sharePct !== null ? t("flagAriaValue", { pct: sharePct }) : t("flagAriaNone");
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        onMouseEnter={() => onHover?.(row.categoryId)}
        onFocus={() => onHover?.(row.categoryId)}
        className={`w-full text-left ${GRID} px-1 py-2.5 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none transition-colors`}
        aria-label={t("rowAriaLabel", {
          name: row.categoryName,
          count: row.targetCount,
          flag: flagAria,
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
          <p className="text-[11px] text-[var(--undp-gray)] tabular-nums leading-tight mt-0.5">
            {t("primaryCount", { count: row.targetCount })}
            {hasPool && row.relevantOnlyCount !== null
              ? " · " + t("relevantCount", { count: row.relevantOnlyCount })
              : ""}
          </p>
        </div>
        <CoverageBar count={row.targetCount} max={maxTargetCount} />
        <FlagShareCell share={row.flaggedShare} maxShare={maxShare} mid={midShare} />
      </button>
    </li>
  );
}

/** Neutral magnitude bar for sector coverage (target count). */
function CoverageBar({ count, max }: { count: number; max: number }) {
  const fillPct = max > 0 ? Math.min(100, (count / max) * 100) : 0;
  const displayPct = count > 0 ? Math.max(fillPct, 4) : 0;
  return (
    <div className="flex flex-col items-start gap-1 w-full">
      <span
        aria-hidden="true"
        className="block h-1.5 w-full rounded-full overflow-hidden"
        style={{ backgroundColor: BAR_TRACK }}
      >
        <span
          className="block h-full rounded-full"
          style={{
            width: `${displayPct}%`,
            backgroundColor: count > 0 ? BAR_COVERAGE : "transparent",
          }}
        />
      </span>
      <span className="text-[11px] tabular-nums leading-none text-[var(--undp-black)] font-medium">
        {count.toLocaleString()}
      </span>
    </div>
  );
}

/**
 * Size-robust flagged share, with a faint tick at the corpus average so a sector
 * reads as above or below typical at a glance. "—" when the sector has no reviewed
 * relationships (distinct from a genuine 0% rate).
 */
function FlagShareCell({
  share,
  maxShare,
  mid,
}: {
  share: number | null;
  maxShare: number;
  mid: number;
}) {
  if (share === null) {
    return (
      <div className="flex flex-col items-start gap-1 w-full">
        <span
          aria-hidden="true"
          className="block h-1.5 w-full rounded-full"
          style={{ backgroundColor: BAR_TRACK }}
        />
        <span className="text-[11px] tabular-nums leading-none text-[var(--undp-gray)]/60">
          —
        </span>
      </div>
    );
  }
  const pct = Math.round(share * 100);
  const fillPct = maxShare > 0 ? Math.min(100, (share / maxShare) * 100) : 0;
  const displayPct = share > 0 ? Math.max(fillPct, 4) : 0;
  const midPct = maxShare > 0 ? Math.min(100, (mid / maxShare) * 100) : 0;
  return (
    // Guided-tour anchor; the tour spotlights the first cell with a bar.
    <div className="flex flex-col items-start gap-1 w-full" data-tour="sector-flag-share">
      <span
        aria-hidden="true"
        className="relative block h-1.5 w-full rounded-full overflow-hidden"
        style={{ backgroundColor: BAR_TRACK }}
      >
        <span
          className="block h-full rounded-full"
          style={{
            width: `${displayPct}%`,
            backgroundColor: share > 0 ? BAR_FLAG : "transparent",
          }}
        />
        {mid > 0 && maxShare > 0 && (
          <span
            className="absolute top-0 h-full"
            style={{ left: `${midPct}%`, width: "1px", backgroundColor: MID_TICK }}
          />
        )}
      </span>
      <span
        className={`text-[11px] tabular-nums leading-none ${
          share > 0
            ? "text-[var(--undp-black)] font-medium"
            : "text-[var(--undp-gray)]/60"
        }`}
      >
        {pct}%
      </span>
    </div>
  );
}
