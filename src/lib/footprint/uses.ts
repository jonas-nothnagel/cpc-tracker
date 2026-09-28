import type { FootprintMetrics, LedgerEvent } from "./types";

/**
 * What the ledger's entries were for, in the terms of the /sustainability
 * page: building a country's analysis (every pipeline run, the team's or a
 * user's), reading uploaded documents, or answering in the chat. Pure, so the
 * page's groupings are unit-tested.
 */
export type UseKind = "analysis" | "extract" | "chat";

export interface FootprintGroup extends FootprintMetrics {
  /** Unique within its grouping. */
  key: string;
  call_count: number;
  cached_call_count: number;
  /** Distinct models, most carbon first. */
  models: string[];
  /** The group's entries, newest first. */
  entries: LedgerEvent[];
}

export interface UseGroup extends FootprintGroup {
  kind: UseKind;
  /** The analysed country (analyses only; null when the entry names none). */
  country: string | null;
}

export function purposeOf(e: LedgerEvent): { kind: UseKind; country: string | null } {
  if (e.component === "chat") return { kind: "chat", country: null };
  if (e.component === "extract") return { kind: "extract", country: null };
  return { kind: "analysis", country: e.country };
}

const byCarbon = (a: FootprintGroup, b: FootprintGroup) =>
  b.co2_geq - a.co2_geq || a.key.localeCompare(b.key);

function summarise(key: string, entries: LedgerEvent[]): FootprintGroup {
  const group: FootprintGroup = {
    key,
    energy_wh: 0,
    water_ml: 0,
    co2_geq: 0,
    minerals_ugsbeq: 0,
    call_count: 0,
    cached_call_count: 0,
    models: [],
    entries: [...entries].sort((a, b) => b.ts.localeCompare(a.ts)),
  };
  const byModel = new Map<string, number>();
  for (const e of entries) {
    group.energy_wh += e.energy_wh;
    group.water_ml += e.water_ml;
    group.co2_geq += e.co2_geq;
    group.minerals_ugsbeq += e.minerals_ugsbeq;
    group.call_count += e.call_count;
    group.cached_call_count += e.cached_call_count;
    byModel.set(e.model, (byModel.get(e.model) ?? 0) + e.co2_geq);
  }
  group.models = [...byModel.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([model]) => model);
  return group;
}

/** One group per use: an analysis per country, then document reading and
 *  the chat; largest carbon first. */
export function groupByUse(events: LedgerEvent[]): UseGroup[] {
  const buckets = new Map<string, { kind: UseKind; country: string | null; entries: LedgerEvent[] }>();
  for (const e of events) {
    const use = purposeOf(e);
    const key = use.kind === "analysis" ? `analysis:${use.country ?? ""}` : use.kind;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { ...use, entries: [] };
      buckets.set(key, bucket);
    }
    bucket.entries.push(e);
  }
  return [...buckets.entries()]
    .map(([key, b]) => ({ ...summarise(key, b.entries), kind: b.kind, country: b.country }))
    .sort(byCarbon);
}

/** First and last day with an entry ("YYYY-MM-DD", UTC). */
export function recordedSpan(events: LedgerEvent[]): { from: string; to: string } | null {
  if (events.length === 0) return null;
  let from = events[0].ts;
  let to = events[0].ts;
  for (const e of events) {
    if (e.ts < from) from = e.ts;
    if (e.ts > to) to = e.ts;
  }
  return { from: from.slice(0, 10), to: to.slice(0, 10) };
}

/** Electricity zones the entries were counted in, most carbon first. */
export function regionsOf(events: LedgerEvent[]): string[] {
  const byRegion = new Map<string, number>();
  for (const e of events) byRegion.set(e.region, (byRegion.get(e.region) ?? 0) + e.co2_geq);
  return [...byRegion.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([region]) => region);
}
