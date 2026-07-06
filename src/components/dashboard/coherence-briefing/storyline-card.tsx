"use client";

/**
 * StorylineRow — one corpus theme rendered as a plain-typography list row:
 * polarity dot + eyebrow, the noun-phrase theme name, a one-line clamped
 * description, and a live-computed meta line. Clicking opens the ThemeDrawer.
 *
 * Counts come from the caller's live stats (recomputed from the visible
 * alignment), never from the persisted pair_count, so the row stays exact
 * under document toggling and honest on old-format payloads.
 *
 * Replaces the former StorylineCard grid card (rows in labeled groups beat
 * 5-7 equal cards for prioritization; plain typography per the minimal
 * panel-chrome guideline).
 */

import { useTranslations } from "next-intl";
import { getDocLabel } from "@/lib/utils";
import type { StorylineLiveStats } from "@/lib/coherence-briefing";
import type { CorpusStoryline, CountryConfig } from "@/types";

const HEADLINE_SERIF =
  "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif";
const ALIGNED_DOT_COLOR = "#196127";
const FRICTION_DOT_COLOR = "#dc2626";

export function StorylineRow({
  storyline,
  stats,
  countryConfig,
  totalAvailableDocs,
  onOpen,
}: {
  storyline: CorpusStoryline;
  stats: StorylineLiveStats;
  countryConfig: CountryConfig | null;
  totalAvailableDocs: number;
  onOpen: () => void;
}) {
  const t = useTranslations("briefing.storylineCard");
  const isReinforce = storyline.type === "reinforcement";
  const dotColor = isReinforce ? ALIGNED_DOT_COLOR : FRICTION_DOT_COLOR;
  const topDocs = [...stats.docCounts.entries()]
    .sort((x, y) => (y[1] !== x[1] ? y[1] - x[1] : x[0].localeCompare(y[0])))
    .slice(0, 2)
    .map(([doc]) => getDocLabel(countryConfig, doc))
    .join(", ");
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left py-2.5 px-1 rounded hover:bg-gray-50 transition-colors"
    >
      <p
        className="text-[9.5px] uppercase tracking-wider font-semibold mb-1 inline-flex items-center gap-1.5"
        style={{ color: dotColor }}
      >
        <span
          aria-hidden="true"
          className="block h-2 w-2 rounded-full"
          style={
            isReinforce
              ? { backgroundColor: dotColor }
              : { boxShadow: `inset 0 0 0 1px ${dotColor}` }
          }
        />
        {isReinforce ? t("eyebrow.reinforce") : t("eyebrow.friction")}
      </p>
      <p
        className="text-[13.5px] text-[var(--undp-black)] leading-snug"
        style={{ fontFamily: HEADLINE_SERIF }}
      >
        {storyline.name}
      </p>
      <p
        className="mt-0.5 text-[11.5px] text-[var(--undp-gray)] leading-snug overflow-hidden"
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 1,
          WebkitBoxOrient: "vertical",
        }}
      >
        {storyline.description}
      </p>
      <p className="mt-1 text-[10.5px] text-[var(--undp-gray)] tabular-nums">
        {isReinforce
          ? t("metaReinforce", {
              docs: stats.docCounts.size,
              total: totalAvailableDocs,
              count: stats.liveCount,
            })
          : t("metaFriction", { count: stats.liveCount, docs: topDocs })}
      </p>
    </button>
  );
}
