import type { FootprintMetrics, LedgerEvent } from "./types";
import { purposeOf, type UseKind } from "./uses";

/**
 * The running total behind the /sustainability chart: a resource added up in
 * the order it was recorded, the steps worth naming on the line, and where
 * their names go. Pure, so the chart's choices are unit-tested.
 */

export interface TotalStep {
  ts: string;
  /** The entry's amount of the resource. */
  delta: number;
  /** The running total after it. */
  total: number;
  entry: LedgerEvent;
}

export function runningTotal(
  events: LedgerEvent[],
  metric: keyof FootprintMetrics = "co2_geq",
): TotalStep[] {
  let total = 0;
  return [...events]
    .sort((a, b) => a.ts.localeCompare(b.ts))
    .map((entry) => {
      total += entry[metric];
      return { ts: entry.ts, delta: entry[metric], total, entry };
    });
}

/** Consecutive steps of one use, read on the chart as one step up. */
export interface StepBurst {
  kind: UseKind;
  country: string | null;
  from: string;
  to: string;
  delta: number;
  /** The running total after the burst. */
  total: number;
}

const DAY_MS = 86_400_000;

/** Joins steps of the same use recorded no more than `gapDays` apart, with
 *  no other use between them: runs of one analysis over a day or two. */
export function bursts(steps: TotalStep[], gapDays = 2): StepBurst[] {
  const out: StepBurst[] = [];
  for (const step of steps) {
    const use = purposeOf(step.entry);
    const last = out.at(-1);
    if (
      last &&
      last.kind === use.kind &&
      last.country === use.country &&
      Date.parse(step.ts) - Date.parse(last.to) <= gapDays * DAY_MS
    ) {
      last.to = step.ts;
      last.delta += step.delta;
      last.total = step.total;
    } else {
      out.push({ ...use, from: step.ts, to: step.ts, delta: step.delta, total: step.total });
    }
  }
  return out;
}

/** The steps named on the chart: the largest, until together they make up
 *  `cover` of the total (at most `max` of them), in time order. */
export function labelledBursts(
  list: StepBurst[],
  total: number,
  cover = 0.75,
  max = 6,
): StepBurst[] {
  const chosen = new Set<StepBurst>();
  let covered = 0;
  for (const burst of [...list].sort((a, b) => b.delta - a.delta)) {
    if (total <= 0 || covered >= cover * total || chosen.size >= max || burst.delta <= 0) break;
    chosen.add(burst);
    covered += burst.delta;
  }
  return list.filter((b) => chosen.has(b));
}

export interface PlacedLabel {
  anchor: "start" | "end";
  x: number;
  /** Text baseline. */
  y: number;
}

/**
 * Where each step's name goes: just above the top of its step, to the left,
 * where the line is lower; to the right when it would leave the chart on the
 * left, lifted above the line where the line runs under it (`top` gives the
 * line's highest point, the smallest y, between two x). A name that would
 * cover one already placed is left out (null); the pointer still shows that
 * step.
 */
export function placeLabels(
  items: { x: number; y: number; width: number }[],
  height: number,
  top: (x0: number, x1: number) => number = () => Infinity,
  pad = 4,
): (PlacedLabel | null)[] {
  const taken: { x0: number; x1: number; y0: number; y1: number }[] = [];
  return items.map(({ x, y, width }) => {
    const anchor: PlacedLabel["anchor"] = x - pad - width < 0 ? "start" : "end";
    const x0 = anchor === "end" ? x - pad - width : x + pad;
    const baseline = Math.min(y, top(x0, x0 + width)) - 6;
    const box = { x0, x1: x0 + width, y0: baseline - height, y1: baseline + 2 };
    if (taken.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) {
      return null;
    }
    taken.push(box);
    return { anchor, x: anchor === "end" ? x - pad : x + pad, y: baseline };
  });
}
