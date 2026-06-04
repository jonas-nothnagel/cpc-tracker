"use client";

/**
 * FrictionTypeChart — corpus-level horizontal stacked bar showing how
 * flagged pairs split across the v2.1 mechanisms (goal_conflict /
 * resource_competition / delivery_friction). Each segment is labelled
 * with its share so the dominant kind of friction reads at a glance.
 *
 * Per round-4 review: the per-doc-pair small multiples were removed —
 * the doc-pairs slide already names the heaviest pairings, and stacking
 * a second per-pair view here re-rendered the same information. The
 * three evidence cards below the chart (one per mechanism) carry the
 * "click for a concrete example" pattern instead.
 */

import { Fragment } from "react";
import type {
  FrictionType,
  FrictionTypeTotals,
} from "@/lib/coherence-briefing";
import { MECHANISM_COLORS } from "@/lib/utils";
import {
  useContradictionTypeDescriptions,
  useContradictionTypeLabels,
} from "@/lib/labels";

const ORDER: FrictionType[] = [
  "goal_conflict",
  "resource_competition",
  "delivery_friction",
];

export function FrictionTypeChart({
  totals,
  onSegmentClick,
  caption = "Across the corpus",
}: {
  totals: FrictionTypeTotals;
  onSegmentClick?: (type: FrictionType) => void;
  /** Left-hand label above the bar. Defaults to the corpus framing. */
  caption?: string;
}) {
  const contradictionLabels = useContradictionTypeLabels();
  const { total: totalFlagged } = totals;
  if (totalFlagged === 0) {
    return (
      <p className="text-sm italic text-[var(--undp-gray)]">
        No potential misalignment to break down.
      </p>
    );
  }

  const segments = ORDER.reduce<
    Array<{
      type: FrictionType;
      value: number;
      widthPct: number;
      leftPct: number;
    }>
  >((acc, type) => {
    const value = totals[type];
    if (value <= 0) return acc;
    const consumed = acc.reduce(
      (s, seg) => s + (seg.widthPct * totalFlagged) / 100,
      0,
    );
    acc.push({
      type,
      value,
      widthPct: (value / totalFlagged) * 100,
      leftPct: (consumed / totalFlagged) * 100,
    });
    return acc;
  }, []);

  return (
    <div className="border-y border-gray-200 py-5">
      <div className="mb-3 flex items-baseline justify-between gap-3 flex-wrap">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--undp-gray)]">
          {caption}
        </p>
        <p className="text-[11px] text-[var(--undp-black)] tabular-nums font-medium">
          {totalFlagged.toLocaleString()} potentially misaligned pairs
        </p>
      </div>
      <div
        className="relative h-7 rounded-sm overflow-hidden bg-gray-100"
        aria-hidden="true"
      >
        {segments.map(({ type, widthPct, leftPct, value }) => {
          const handleClick = onSegmentClick
            ? () => onSegmentClick(type)
            : undefined;
          const style = {
            left: `${leftPct}%`,
            width: `${widthPct}%`,
            backgroundColor: MECHANISM_COLORS[type],
          };
          const title = `${contradictionLabels[type]} · ${value.toLocaleString()} (${Math.round(widthPct)}%)`;
          return (
            <Fragment key={type}>
              {handleClick ? (
                <button
                  type="button"
                  onClick={handleClick}
                  aria-label={title}
                  title={title}
                  className="absolute inset-y-0 cursor-pointer hover:brightness-110 hover:ring-2 hover:ring-[var(--undp-black)]/40 focus:outline-none focus:ring-2 focus:ring-[var(--undp-black)]/50"
                  style={style}
                />
              ) : (
                <span
                  aria-label={title}
                  title={title}
                  className="absolute inset-y-0"
                  style={style}
                />
              )}
            </Fragment>
          );
        })}
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-3 text-[11px]">
        {ORDER.map((type) => {
          const value = totals[type];
          const pct = totalFlagged > 0 ? Math.round((value / totalFlagged) * 100) : 0;
          return (
            <SegmentTotal
              key={type}
              type={type}
              value={value}
              pct={pct}
              color={MECHANISM_COLORS[type]}
            />
          );
        })}
      </div>
    </div>
  );
}

function SegmentTotal({
  type,
  value,
  pct,
  color,
}: {
  type: FrictionType;
  value: number;
  pct: number;
  color: string;
}) {
  const labels = useContradictionTypeLabels();
  const descriptions = useContradictionTypeDescriptions();
  return (
    <div>
      <p
        className="text-[9.5px] uppercase tracking-wider font-semibold inline-flex items-center gap-1.5"
        style={{ color }}
      >
        <span
          aria-hidden="true"
          className="inline-block w-2.5 h-2.5 rounded-sm"
          style={{ backgroundColor: color }}
        />
        {labels[type]}
      </p>
      <p className="text-[15px] text-[var(--undp-black)] font-medium tabular-nums mt-0.5">
        {pct}%
        <span className="text-[11px] text-[var(--undp-gray)] font-normal ml-1">
          ({value.toLocaleString()})
        </span>
      </p>
      <p className="text-[10px] text-[var(--undp-gray)] leading-snug mt-1">
        {descriptions[type]}
      </p>
    </div>
  );
}
