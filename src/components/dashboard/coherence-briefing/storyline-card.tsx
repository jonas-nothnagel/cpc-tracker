"use client";

/**
 * ThemeBox — one corpus theme as a compact box in the Direction section's
 * side-by-side columns (coherent themes left, potentially misaligned themes
 * right). Leads with the noun-phrase theme name, then a slim segmented strip
 * showing WHICH documents drive the theme (same document colors as the
 * wheel), then the live pair count. Clicking opens the ThemeDrawer; hovering
 * spotlights the theme's documents on the adjacent wheel.
 *
 * Counts and document shares come from the caller's live stats (recomputed
 * from the visible alignment), never from the persisted pair_count, so the
 * box stays exact under document toggling and honest on old-format payloads.
 * The description intentionally stays off the box face (it lives in the
 * drawer): the landing boxes state what recurs, where, and how much.
 */

import { useTranslations } from "next-intl";
import { getDocColor, getDocFullLabel, getDocLabel } from "@/lib/utils";
import type { StorylineLiveStats } from "@/lib/coherence-briefing";
import type { CorpusStoryline, CountryConfig } from "@/types";

const HEADLINE_SERIF =
  "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif";

const LEGEND_DOCS = 3;

/** Hover payload for the wheel spotlight (live docs + polarity). */
export interface ThemeSpotlight {
  docs: string[];
  polarity: "reinforcement" | "friction";
}

export function ThemeBox({
  storyline,
  stats,
  countryConfig,
  onOpen,
  onSpotlight,
}: {
  storyline: CorpusStoryline;
  stats: StorylineLiveStats;
  countryConfig: CountryConfig | null;
  onOpen: () => void;
  onSpotlight?: (spotlight: ThemeSpotlight | null) => void;
}) {
  const t = useTranslations("briefing.storylineCard");
  const isReinforce = storyline.type === "reinforcement";
  const segments = [...stats.docCounts.entries()]
    .sort((x, y) => (y[1] !== x[1] ? y[1] - x[1] : x[0].localeCompare(y[0])))
    .map(([doc, count]) => ({ doc, count }));
  const segmentTotal = segments.reduce((s, seg) => s + seg.count, 0);
  const legendDocs = segments.slice(0, LEGEND_DOCS);
  const legendRest = segments.length - legendDocs.length;

  const spotlight: ThemeSpotlight | null =
    segments.length > 0
      ? { docs: segments.map((s) => s.doc), polarity: storyline.type }
      : null;
  const show = () => onSpotlight?.(spotlight);
  const hide = () => onSpotlight?.(null);

  return (
    <button
      type="button"
      onClick={() => {
        hide();
        onOpen();
      }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      className="flex h-full w-full flex-col text-left rounded border border-gray-200 bg-white px-3.5 py-3 hover:border-gray-400 transition-colors"
    >
      <p
        className="text-[13.5px] text-[var(--undp-black)] leading-snug"
        style={{ fontFamily: HEADLINE_SERIF }}
      >
        {storyline.name}
      </p>

      {segmentTotal > 0 && (
        <>
          <span
            aria-hidden="true"
            className="mt-2.5 flex h-1.5 w-full gap-px overflow-hidden rounded-full"
          >
            {segments.map((s) => (
              <span
                key={s.doc}
                className="block h-full"
                style={{
                  width: `${(s.count / segmentTotal) * 100}%`,
                  minWidth: 3,
                  backgroundColor: getDocColor(countryConfig, s.doc),
                }}
                title={getDocFullLabel(countryConfig, s.doc)}
              />
            ))}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[var(--undp-gray)]">
            {legendDocs.map((s) => (
              <span
                key={s.doc}
                className="inline-flex items-center gap-1"
                title={getDocFullLabel(countryConfig, s.doc)}
              >
                <span
                  aria-hidden="true"
                  className="block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: getDocColor(countryConfig, s.doc) }}
                />
                {getDocLabel(countryConfig, s.doc)}
              </span>
            ))}
            {legendRest > 0 && <span>{t("boxMoreDocs", { count: legendRest })}</span>}
          </span>
        </>
      )}

      <p className="mt-2 text-[10.5px] text-[var(--undp-gray)] tabular-nums">
        {isReinforce
          ? t("boxAligned", { count: stats.liveCount })
          : t("boxMisaligned", { count: stats.liveCount })}
      </p>
    </button>
  );
}
