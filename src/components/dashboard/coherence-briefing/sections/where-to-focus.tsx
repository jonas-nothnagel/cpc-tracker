"use client";

/**
 * Where-to-focus — answers "is the friction a few contested targets or many,
 * and which ones?" No other slide ranks individual targets: Doc-pairs groups
 * by document, Friction-types by mechanism, Sectors by theme. This slide names
 * the specific targets that recur across the most potentially misaligned pairs, plus a
 * concentration verdict (few vs many), so a policymaker sees where to put
 * attention first. Each row opens that target's FlagProfileDrawer.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SlideFrame } from "../slide-frame";
import { ReadingLine, glossaryTags } from "@/components/ui/glossary";
import { TourButton } from "../tour/tour-button";
import type {
  TargetConcentration,
  TargetConcentrationEntry,
  TargetFriction,
} from "@/lib/coherence-briefing";
import { FLAGGED_COLOR, getDocColor, getDocMediumLabel } from "@/lib/utils";
import type { CountryConfig, Target } from "@/types";

export const WHERE_TO_FOCUS_SECTION_ID = "where-to-focus";

/** How many contested targets the face lists before the "Show all" expander. */
const VISIBLE_CAP = 5;

const FRICTION_BAR = FLAGGED_COLOR;
const BAR_TRACK = "var(--color-line)";
const OTHERS_FILL = "var(--color-line)";

export function WhereToFocusSection({
  hotspots,
  concentration,
  countryConfig,
  onOpenTarget,
}: {
  hotspots: TargetFriction[];
  concentration: TargetConcentration;
  countryConfig: CountryConfig | null;
  onOpenTarget: (target: Target) => void;
}) {
  const t = useTranslations("briefing.whereToFocus");
  const [showAll, setShowAll] = useState(false);
  const sentence = composeFocusSentence(concentration, t);
  const maxCount = hotspots[0]?.flaggedPairCount ?? 0;
  const visibleHotspots = showAll ? hotspots : hotspots.slice(0, VISIBLE_CAP);
  return (
    <SlideFrame
      id={WHERE_TO_FOCUS_SECTION_ID}
      headline={sentence.headline}
      body={sentence.body}
      reading={<ReadingLine>{t.rich("reading", glossaryTags())}</ReadingLine>}
      tourButton={
        hotspots.length > 0 ? (
          <TourButton tourId="whereToFocus" scopeId={WHERE_TO_FOCUS_SECTION_ID} labelled />
        ) : undefined
      }
      evidence={
        hotspots.length === 0 ? (
          <p className="text-body text-[var(--undp-gray)]">{t("empty")}</p>
        ) : (
          <>
            <ConcentrationBar
              topTargets={concentration.topTargets}
              totalFlaggedPairs={concentration.totalFlaggedPairs}
              contestedTargetCount={concentration.contestedTargetCount}
              countryConfig={countryConfig}
              onOpenTarget={onOpenTarget}
            />
            <ul
              className="border-y border-gray-200 divide-y divide-gray-100"
              data-tour="hotspot-list"
            >
              {visibleHotspots.map((h) => (
                <HotspotRow
                  key={h.target.id}
                  hotspot={h}
                  max={maxCount}
                  countryConfig={countryConfig}
                  onSelect={() => onOpenTarget(h.target)}
                />
              ))}
            </ul>
            {hotspots.length > VISIBLE_CAP && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="mt-2 text-caption text-[var(--undp-gray)] hover:text-[var(--undp-black)] underline underline-offset-2 tabular-nums"
              >
                {showAll
                  ? t("showFewer")
                  : t("showAll", { count: hotspots.length })}
              </button>
            )}
          </>
        )
      }
    />
  );
}

interface FocusSentence {
  headline: string;
  body: string;
}

function composeFocusSentence(
  c: TargetConcentration,
  t: ReturnType<typeof useTranslations<"briefing.whereToFocus">>,
): FocusSentence {
  const { contestedTargetCount, totalFlaggedPairs, topCount, coveredPairShare } =
    c;
  if (totalFlaggedPairs === 0 || contestedTargetCount === 0) {
    return {
      headline: t("sentence.emptyHeadline"),
      body: t("sentence.emptyBody"),
    };
  }
  const sharePct = Math.round(coveredPairShare * 100);
  const concentrated =
    topCount <= Math.max(1, Math.round(contestedTargetCount * 0.2));
  if (topCount === 1) {
    return {
      headline: t("sentence.singleHeadline", { pct: sharePct }),
      body: t("sentence.singleBody", {
        total: totalFlaggedPairs,
        contested: contestedTargetCount,
        pct: sharePct,
      }),
    };
  }
  if (concentrated) {
    return {
      headline: t("sentence.concentratedHeadline", { top: topCount, pct: sharePct }),
      body: t("sentence.concentratedBody", {
        total: totalFlaggedPairs,
        contested: contestedTargetCount,
        top: topCount,
        pct: sharePct,
      }),
    };
  }
  return {
    headline: t("sentence.spreadHeadline", { contested: contestedTargetCount }),
    body: t("sentence.spreadBody", {
      top: topCount,
      contested: contestedTargetCount,
      pct: sharePct,
      total: totalFlaggedPairs,
    }),
  };
}

function HotspotRow({
  hotspot,
  max,
  countryConfig,
  onSelect,
}: {
  hotspot: TargetFriction;
  max: number;
  countryConfig: CountryConfig | null;
  onSelect: () => void;
}) {
  const t = useTranslations("briefing.whereToFocus");
  const { target, flaggedPairCount } = hotspot;
  const color = getDocColor(countryConfig, target.sourceDocument);
  const docLabel = getDocMediumLabel(countryConfig, target.sourceDocument);
  const fillPct = max > 0 ? Math.max(6, (flaggedPairCount / max) * 100) : 0;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="w-full text-left grid grid-cols-[1fr_5.5rem] items-center gap-4 px-1 py-3 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none transition-colors"
        aria-label={t("rowAriaLabel", {
          doc: docLabel,
          label: target.sourceLabel,
          count: flaggedPairCount,
        })}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span
              aria-hidden="true"
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="text-caption text-[var(--undp-gray)]">
              {docLabel} {target.sourceLabel}
            </span>
          </div>
          <p
            className="text-data text-[var(--undp-black)] leading-snug truncate"
            title={target.text}
          >
            {target.text}
          </p>
        </div>
        <div className="flex flex-col items-start gap-1">
          <span
            aria-hidden="true"
            className="block h-1.5 w-full rounded-full overflow-hidden"
            style={{ backgroundColor: BAR_TRACK }}
          >
            <span
              className="block h-full rounded-full"
              style={{ width: `${fillPct}%`, backgroundColor: FRICTION_BAR }}
            />
          </span>
          <span className="text-caption tabular-nums text-[var(--undp-black)] font-medium">
            {flaggedPairCount.toLocaleString()}{" "}
            <span className="text-[var(--undp-gray)] font-normal">{t("pairsSuffix")}</span>
          </span>
        </div>
      </button>
    </li>
  );
}

/**
 * Segmented concentration bar: one chunk per hotspot target (width = the
 * distinct potentially misaligned pairs it adds, so chunks tile honestly) plus a single "all
 * other targets" tail. A few fat chunks visibly fill the covered share, then a
 * long thin remainder, so "a few targets carry most friction" reads at a
 * glance. Sits on top of the most-contested list; chunks click into a target.
 */
function ConcentrationBar({
  topTargets,
  totalFlaggedPairs,
  contestedTargetCount,
  countryConfig,
  onOpenTarget,
}: {
  topTargets: TargetConcentrationEntry[];
  totalFlaggedPairs: number;
  contestedTargetCount: number;
  countryConfig: CountryConfig | null;
  onOpenTarget: (target: Target) => void;
}) {
  const t = useTranslations("briefing.whereToFocus");
  if (topTargets.length === 0 || totalFlaggedPairs === 0) return null;
  const coveredPairs = topTargets.reduce((s, t) => s + t.marginalPairCount, 0);
  const remainder = Math.max(0, totalFlaggedPairs - coveredPairs);
  const sharePct = Math.round((coveredPairs / totalFlaggedPairs) * 100);
  const othersCount = Math.max(0, contestedTargetCount - topTargets.length);
  return (
    <div className="mb-7">
      <div className="flex items-baseline justify-between mb-1.5">
        <p className="text-caption text-[var(--undp-gray)]">{t("bar.title")}</p>
        <p className="text-caption tabular-nums text-[var(--undp-black)] font-medium">
          {t("bar.totalPairs", { count: totalFlaggedPairs })}
        </p>
      </div>
      <div
        className="flex h-7 w-full overflow-hidden rounded-sm bg-gray-100 gap-px"
        data-tour="concentration-bar"
      >
        {topTargets.map((entry) => {
          const widthPct = (entry.marginalPairCount / totalFlaggedPairs) * 100;
          const docLabel = getDocMediumLabel(
            countryConfig,
            entry.target.sourceDocument,
          );
          const title = t("bar.segmentTitle", {
            doc: docLabel,
            label: entry.target.sourceLabel,
            count: entry.flaggedPairCount,
          });
          return (
            <button
              key={entry.target.id}
              type="button"
              onClick={() => onOpenTarget(entry.target)}
              title={title}
              aria-label={title}
              className="h-full cursor-pointer transition-[filter] hover:brightness-125 focus:outline-none focus:ring-2 focus:ring-[var(--undp-black)]/50"
              style={{
                width: `${widthPct}%`,
                minWidth: 3,
                backgroundColor: getDocColor(
                  countryConfig,
                  entry.target.sourceDocument,
                ),
              }}
            />
          );
        })}
        {remainder > 0 && (
          <span
            className="h-full"
            style={{
              width: `${(remainder / totalFlaggedPairs) * 100}%`,
              backgroundColor: OTHERS_FILL,
            }}
            title={t("bar.othersTitle", {
              others: othersCount,
              remainder,
            })}
          />
        )}
      </div>
      <p
        className="mt-2 text-caption text-[var(--undp-gray)]"
        data-tour="concentration-legend"
      >
        {t("bar.legend", { count: topTargets.length, pct: sharePct })}
      </p>
    </div>
  );
}
