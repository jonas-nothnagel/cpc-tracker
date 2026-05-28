"use client";

/**
 * Where-to-focus — answers "is the friction a few contested targets or many,
 * and which ones?" No other slide ranks individual targets: Doc-pairs groups
 * by document, Friction-types by mechanism, Sectors by theme. This slide names
 * the specific targets that recur across the most flagged pairs, plus a
 * concentration verdict (few vs many), so a policymaker sees where to put
 * attention first. Each row opens that target's FlagProfileDrawer.
 */

import { SlideFrame } from "../slide-frame";
import type {
  TargetConcentration,
  TargetConcentrationEntry,
  TargetFriction,
} from "@/lib/coherence-briefing";
import { getDocColor, getDocMediumLabel } from "@/lib/utils";
import type { CountryConfig, Target } from "@/types";

export const WHERE_TO_FOCUS_SECTION_ID = "where-to-focus";

const FRICTION_BAR = "#dc2626";
const BAR_TRACK = "#e5e7eb";
const OTHERS_FILL = "#e2e8f0";

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
  const sentence = composeFocusSentence(concentration);
  const maxCount = hotspots[0]?.flaggedPairCount ?? 0;
  return (
    <SlideFrame
      id={WHERE_TO_FOCUS_SECTION_ID}
      eyebrow="Where should we focus first?"
      headline={sentence.headline}
      body={sentence.body}
      evidence={
        hotspots.length === 0 ? (
          <p className="text-sm italic text-[var(--undp-gray)]">
            No targets are involved in flagged pairs yet.
          </p>
        ) : (
          <>
            <ConcentrationBar
              topTargets={concentration.topTargets}
              totalFlaggedPairs={concentration.totalFlaggedPairs}
              contestedTargetCount={concentration.contestedTargetCount}
              countryConfig={countryConfig}
              onOpenTarget={onOpenTarget}
            />
            <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-1">
              Most-contested targets
            </p>
            <ul className="border-y border-gray-200 divide-y divide-gray-100">
              {hotspots.map((h) => (
                <HotspotRow
                  key={h.target.id}
                  hotspot={h}
                  max={maxCount}
                  countryConfig={countryConfig}
                  onSelect={() => onOpenTarget(h.target)}
                />
              ))}
            </ul>
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

function composeFocusSentence(c: TargetConcentration): FocusSentence {
  const { contestedTargetCount, totalFlaggedPairs, topCount, coveredPairShare } =
    c;
  if (totalFlaggedPairs === 0 || contestedTargetCount === 0) {
    return {
      headline: "No flagged pairs to focus yet.",
      body: "Once the pipeline flags pairs for review, the targets carrying the most friction surface here.",
    };
  }
  const sharePct = Math.round(coveredPairShare * 100);
  // Concentrated when a small fraction of contested targets carries the share.
  const concentrated =
    topCount <= Math.max(1, Math.round(contestedTargetCount * 0.2));
  if (topCount === 1) {
    return {
      headline: `One target sits in ${sharePct}% of all flagged pairs.`,
      body: `${totalFlaggedPairs.toLocaleString()} flagged pairs trace back to ${contestedTargetCount} targets, but a single one accounts for ${sharePct}%. Click it to see what it clashes with.`,
    };
  }
  if (concentrated) {
    return {
      headline: `Just ${topCount} targets carry ${sharePct}% of the friction.`,
      body: `${totalFlaggedPairs.toLocaleString()} flagged pairs trace back to ${contestedTargetCount} targets, but only ${topCount} of them are involved in ${sharePct}%. These are where to look first.`,
    };
  }
  return {
    headline: `Friction spreads across ${contestedTargetCount} targets.`,
    body: `It takes ${topCount} of ${contestedTargetCount} targets to cover ${sharePct}% of the ${totalFlaggedPairs.toLocaleString()} flagged pairs, so no single handful dominates. The heaviest are listed below.`,
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
        aria-label={`${docLabel} ${target.sourceLabel}: involved in ${flaggedPairCount} flagged pairs`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span
              aria-hidden="true"
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)]">
              {docLabel} {target.sourceLabel}
            </span>
          </div>
          <p
            className="text-[13.5px] text-[var(--undp-black)] leading-snug truncate"
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
          <span className="text-[11px] tabular-nums text-[var(--undp-black)] font-medium">
            {flaggedPairCount.toLocaleString()}{" "}
            <span className="text-[var(--undp-gray)] font-normal">pairs</span>
          </span>
        </div>
      </button>
    </li>
  );
}

/**
 * Segmented concentration bar: one chunk per hotspot target (width = the
 * distinct flagged pairs it adds, so chunks tile honestly) plus a single "all
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
  if (topTargets.length === 0 || totalFlaggedPairs === 0) return null;
  const coveredPairs = topTargets.reduce((s, t) => s + t.marginalPairCount, 0);
  const remainder = Math.max(0, totalFlaggedPairs - coveredPairs);
  const sharePct = Math.round((coveredPairs / totalFlaggedPairs) * 100);
  const othersCount = Math.max(0, contestedTargetCount - topTargets.length);
  return (
    <div className="mb-7">
      <div className="flex items-baseline justify-between mb-1.5">
        <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--undp-gray)]">
          Where the friction concentrates
        </p>
        <p className="text-[11px] tabular-nums text-[var(--undp-black)] font-medium">
          {totalFlaggedPairs.toLocaleString()} flagged pairs
        </p>
      </div>
      <div className="flex h-7 w-full overflow-hidden rounded-sm bg-gray-100 gap-px">
        {topTargets.map((t) => {
          const widthPct = (t.marginalPairCount / totalFlaggedPairs) * 100;
          const docLabel = getDocMediumLabel(
            countryConfig,
            t.target.sourceDocument,
          );
          const title = `${docLabel} ${t.target.sourceLabel}: in ${t.flaggedPairCount.toLocaleString()} flagged pairs · click to open`;
          return (
            <button
              key={t.target.id}
              type="button"
              onClick={() => onOpenTarget(t.target)}
              title={title}
              aria-label={title}
              className="h-full cursor-pointer transition-[filter] hover:brightness-125 focus:outline-none focus:ring-2 focus:ring-[var(--undp-black)]/50"
              style={{
                width: `${widthPct}%`,
                minWidth: 3,
                backgroundColor: getDocColor(
                  countryConfig,
                  t.target.sourceDocument,
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
            title={`${othersCount.toLocaleString()} other targets: ${remainder.toLocaleString()} flagged pairs`}
          />
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--undp-gray)]">
        <span className="text-[var(--undp-black)]">
          <span className="font-medium">
            {topTargets.length} target{topTargets.length === 1 ? "" : "s"}
          </span>{" "}
          carry {sharePct}% of flagged pairs
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block w-2.5 h-2.5 rounded-sm"
            style={{ backgroundColor: OTHERS_FILL }}
          />
          {othersCount.toLocaleString()} other targets
        </span>
        <span className="text-[var(--undp-gray)]/70">
          each segment is one target, coloured by its document · click to open
        </span>
      </div>
    </div>
  );
}
