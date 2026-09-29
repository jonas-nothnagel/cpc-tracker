import { NO_PLACE, type Contract, type ContractYear, type PlaceTotal } from "./model";
import { placeKey } from "./places";

/**
 * What each view says about the focus: the years, the map (money and
 * tenders), the documents served together, the policy areas' targets and the
 * targets to look closer at. Pure; the views decide which contracts count.
 */

/** Square sizes, largest first: a focus is drawn in the largest that still
 *  gives it enough squares to read. */
export const UNITS = [5e9, 2e9, 1e9, 5e8, 2e8, 1e8, 5e7, 2e7, 1e7, 5e6] as const;

export function unitFor(total: number, want = 100): number {
  for (const u of UNITS) if (total / u >= want * 0.6) return u;
  return UNITS[UNITS.length - 1];
}

/** How many squares of `unit` a sum fills: any money at least one. */
export function squaresOf(total: number, unit: number): number {
  return total > 0 ? Math.max(1, Math.round(total / unit)) : 0;
}

const add = <K>(m: Map<K, number>, k: K, v: number) => m.set(k, (m.get(k) ?? 0) + v);
const sumOf = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0);

// ── The years ────────────────────────────────────────────────────────

/** The money mainly for nature or climate in focus, by year. */
export function yearFocus(contracts: Contract[], keep: (c: Contract) => boolean): Map<number, number> {
  const out = new Map<number, number>();
  for (const c of contracts) if (c.tier === "principal" && keep(c)) add(out, c.year, c.value);
  return out;
}

/** The years with a full record: a year is thin below a fifth of the median
 *  year's contracts (the first and last are often partial). */
export function fullYears(years: ContractYear[]): number[] {
  const counts = years.map((y) => y.contracts).sort((a, b) => a - b);
  const median = counts.length ? counts[Math.floor(counts.length / 2)] : 0;
  return years.filter((y) => y.contracts >= median * 0.2).map((y) => y.year);
}

// ── The map: money ───────────────────────────────────────────────────

/** The money mainly for nature or climate in focus, by place (NO_PLACE for
 *  none or several). */
export function moneyByPlace(contracts: Contract[], keep: (c: Contract) => boolean): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of contracts) if (c.tier === "principal" && keep(c)) add(out, placeKey(c), c.value);
  return out;
}

export interface PlaceLead {
  code: string;
  /** Its share of the money in focus. */
  share: number;
  /** Its share of all money mainly for nature or climate. */
  baseShare: number;
  /** It holds far more of the focus than of all the money. */
  over: boolean;
}

/** An over-represented place needs this ratio, this share and this much money. */
const OVER_RATIO = 1.5;
const OVER_SHARE = 0.05;
const OVER_PART = 0.03;

/**
 * Where the money in focus concentrates: the named place holding far more of
 * it than of all money mainly for nature or climate (at least `minValue` and
 * 3% of the focus, a 5% share, 1.5 times its usual share), else the named
 * place holding most. With it, the one contract carrying more than half of
 * that place's money in focus, and the share naming no single place.
 */
export function mapFinding(
  by: Map<string, number>,
  base: Map<string, number>,
  contracts: Contract[],
  keep: (c: Contract) => boolean,
  minValue = 3e9,
): { total: number; lead: PlaceLead | null; one: Contract | null; noneShare: number } {
  const total = sumOf(by);
  const baseTotal = sumOf(base);
  if (total <= 0) return { total, lead: null, one: null, noneShare: 0 };
  let over: PlaceLead | null = null;
  let top: PlaceLead | null = null;
  for (const [code, v] of by) {
    if (code === NO_PLACE || v <= 0) continue;
    const share = v / total;
    const baseShare = baseTotal > 0 ? (base.get(code) ?? 0) / baseTotal : 0;
    if (!top || share > top.share) top = { code, share, baseShare, over: false };
    const ok = v >= Math.max(minValue, OVER_PART * total) && share >= OVER_SHARE && baseShare > 0 && share / baseShare >= OVER_RATIO;
    if (ok && (!over || share / baseShare > over.share / over.baseShare)) over = { code, share, baseShare, over: true };
  }
  const lead = over ?? top;
  let one: Contract | null = null;
  if (lead) {
    const own = by.get(lead.code) ?? 0;
    for (const c of contracts) {
      if (c.tier !== "principal" || !keep(c) || placeKey(c) !== lead.code) continue;
      if (c.value > 0.5 * own && (!one || c.value > one.value)) one = c;
    }
  }
  return { total, lead, one, noneShare: (by.get(NO_PLACE) ?? 0) / total };
}

/** Each place's money mainly for nature or climate per unit of its whole
 *  record; the named place with the highest, and the record's own. */
export function rateFinding(
  places: PlaceTotal[],
  principal: Map<string, number>,
): { rates: Map<string, number>; top: { code: string; rate: number } | null; overall: number } {
  const rates = new Map<string, number>();
  let top: { code: string; rate: number } | null = null;
  let all = 0;
  for (const p of places) {
    all += p.value;
    const rate = p.value > 0 ? (principal.get(p.code) ?? 0) / p.value : 0;
    rates.set(p.code, rate);
    if (p.code !== NO_PLACE && p.value > 0 && (!top || rate > top.rate)) top = { code: p.code, rate };
  }
  return { rates, top, overall: all > 0 ? sumOf(principal) / all : 0 };
}

// ── The map: tenders ─────────────────────────────────────────────────

export interface TenderDot {
  tender: string;
  /** The largest contract of the tender: its title, year and place stand for it. */
  lead: Contract;
  lots: Contract[];
  value: number;
  place: string;
  /** The targets in focus it strongly matches, or is potentially misaligned with. */
  targets: string[];
}

/** Tenders with a contract strongly matching ("match") or potentially
 *  misaligned with ("mis") a target in focus, each once, placed where its
 *  largest contract is. Largest first. */
export function tenders(contracts: Contract[], kind: "match" | "mis", keepTarget: (id: string) => boolean): TenderDot[] {
  const groups = new Map<string, { lots: Contract[]; targets: Set<string> }>();
  for (const c of contracts) {
    const ids = (kind === "match" ? c.matches : c.misaligned).filter(keepTarget);
    if (ids.length === 0) continue;
    let g = groups.get(c.tender);
    if (!g) groups.set(c.tender, (g = { lots: [], targets: new Set() }));
    g.lots.push(c);
    ids.forEach((id) => g!.targets.add(id));
  }
  const out: TenderDot[] = [];
  for (const [tender, g] of groups) {
    const lots = [...g.lots].sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
    out.push({
      tender,
      lead: lots[0],
      lots,
      value: lots.reduce((s, c) => s + c.value, 0),
      place: placeKey(lots[0]),
      targets: [...g.targets].sort(),
    });
  }
  return out.sort((a, b) => b.value - a.value || a.tender.localeCompare(b.tender));
}

export interface TenderFinding {
  total: number;
  none: number;
  placed: number;
  noneValue: number;
  placedValue: number;
  noneShare: number;
  /** The named place with the most tenders. */
  top: { code: string; share: number } | null;
  /** A named place holding far more of these tenders than of `base` (only with a base). */
  over: { code: string; share: number; baseShare: number } | null;
}

/** Where the tenders are: how many name no single place, and (with a base to
 *  compare against) a place holding far more of them than usual, at least
 *  `minCount` tenders and 3% of them. */
export function tenderFinding(list: TenderDot[], base: TenderDot[] | null, minCount = 5): TenderFinding {
  const count = new Map<string, number>();
  for (const t of list) add(count, t.place, 1);
  const none = list.filter((t) => t.place === NO_PLACE);
  const placed = list.filter((t) => t.place !== NO_PLACE);
  const total = list.length;
  let top: TenderFinding["top"] = null;
  for (const [code, n] of count) if (code !== NO_PLACE && (!top || n / total > top.share)) top = { code, share: n / total };
  let over: TenderFinding["over"] = null;
  if (base && base.length > 0 && total > 0) {
    const baseCount = new Map<string, number>();
    for (const t of base) add(baseCount, t.place, 1);
    for (const [code, n] of count) {
      if (code === NO_PLACE) continue;
      const share = n / total;
      const baseShare = (baseCount.get(code) ?? 0) / base.length;
      const ok = n >= Math.max(minCount, OVER_PART * total) && share >= OVER_SHARE && baseShare > 0 && share / baseShare >= OVER_RATIO;
      if (ok && (!over || share / baseShare > over.share / over.baseShare)) over = { code, share, baseShare };
    }
  }
  return {
    total,
    none: none.length,
    placed: placed.length,
    noneValue: none.reduce((s, t) => s + t.value, 0),
    placedValue: placed.reduce((s, t) => s + t.value, 0),
    noneShare: total > 0 ? none.length / total : 0,
    top,
    over,
  };
}

// ── Documents served together ────────────────────────────────────────

const docsOf = (c: Contract, docOf: Map<string, string>) =>
  new Set(c.matches.map((t) => docOf.get(t)).filter((d): d is string => d !== undefined));

/** Among the contracts strongly matching a document's targets: the share
 *  that also strongly match each other document, and those serving it alone. */
export function alsoServed(
  contracts: Contract[],
  doc: string,
  docOf: Map<string, string>,
  keep: (c: Contract) => boolean,
): { n: number; alone: number; shares: { doc: string; share: number }[] } {
  const mine = contracts.filter((c) => keep(c) && docsOf(c, docOf).has(doc));
  const n = mine.length;
  const count = new Map<string, number>();
  let alone = 0;
  for (const c of mine) {
    const ds = docsOf(c, docOf);
    if (ds.size === 1) alone += 1;
    for (const d of ds) if (d !== doc) add(count, d, 1);
  }
  const shares = [...count.entries()]
    .map(([d, k]) => ({ doc: d, share: n > 0 ? k / n : 0 }))
    .sort((a, b) => b.share - a.share || a.doc.localeCompare(b.doc));
  return { n, alone: n > 0 ? alone / n : 0, shares };
}

/** A policy area's contracts with a strong match: the share serving targets
 *  in `min` documents or more at once, beside the share among all. */
export function areaSynergy(
  contracts: Contract[],
  areaOf: (c: Contract) => string,
  area: string,
  docOf: Map<string, string>,
  keep: (c: Contract) => boolean,
  min: number,
): { n: number; share: number; base: number } {
  let all = 0;
  let allMany = 0;
  let n = 0;
  let many = 0;
  for (const c of contracts) {
    if (c.matches.length === 0 || !keep(c)) continue;
    const wide = docsOf(c, docOf).size >= min;
    all += 1;
    if (wide) allMany += 1;
    if (areaOf(c) === area) {
      n += 1;
      if (wide) many += 1;
    }
  }
  return { n, share: n > 0 ? many / n : 0, base: all > 0 ? allMany / all : 0 };
}

// ── The targets ──────────────────────────────────────────────────────

export interface TargetStat {
  /** Tenders with a contract strongly matching the target. */
  match: Set<string>;
  /** Tenders with a contract potentially misaligned with it. */
  mis: Set<string>;
  matchContracts: number;
}

export function targetStats(contracts: Contract[], keep: (c: Contract) => boolean): Map<string, TargetStat> {
  const out = new Map<string, TargetStat>();
  const stat = (id: string) => {
    let s = out.get(id);
    if (!s) out.set(id, (s = { match: new Set(), mis: new Set(), matchContracts: 0 }));
    return s;
  };
  for (const c of contracts) {
    if (!keep(c)) continue;
    for (const t of c.matches) {
      const s = stat(t);
      s.match.add(c.tender);
      s.matchContracts += 1;
    }
    for (const t of c.misaligned) stat(t).mis.add(c.tender);
  }
  return out;
}

const EMPTY: TargetStat = { match: new Set(), mis: new Set(), matchContracts: 0 };
export const statOf = (stats: Map<string, TargetStat>, id: string): TargetStat => stats.get(id) ?? EMPTY;

/** How many of these targets have a potentially misaligned tender (red) and a
 *  strongly matching one (green). */
export function areaTargetCounts(ids: string[], stats: Map<string, TargetStat>): { red: number; green: number; total: number } {
  let red = 0;
  let green = 0;
  for (const id of ids) {
    const s = statOf(stats, id);
    if (s.mis.size > 0) red += 1;
    if (s.match.size > 0) green += 1;
  }
  return { red, green, total: ids.length };
}

/** The targets to look closer at: those with potentially misaligned tenders,
 *  most first (then most strongly matching). */
export function closerRows(ids: string[], stats: Map<string, TargetStat>): string[] {
  return ids
    .filter((id) => statOf(stats, id).mis.size > 0)
    .sort((a, b) => {
      const sa = statOf(stats, a);
      const sb = statOf(stats, b);
      return sb.mis.size - sa.mis.size || sb.match.size - sa.match.size || a.localeCompare(b, undefined, { numeric: true });
    });
}

/** The targets no contract strongly matches anywhere, by document in the
 *  brief's order. */
export function closerGaps(
  ids: string[],
  contracts: Contract[],
  docOf: Map<string, string>,
  docOrder: string[],
): { doc: string; ids: string[] }[] {
  const matched = new Set(contracts.flatMap((c) => c.matches));
  const byDoc = new Map<string, string[]>();
  for (const id of ids) {
    if (matched.has(id)) continue;
    const d = docOf.get(id);
    if (!d) continue;
    byDoc.set(d, [...(byDoc.get(d) ?? []), id]);
  }
  return docOrder.filter((d) => byDoc.has(d)).map((d) => ({ doc: d, ids: byDoc.get(d)! }));
}

export interface TenderGroupLine {
  title: string;
  tenders: string[];
  contracts: number;
  targets: number;
  year: number;
  value: number;
}

/** Tenders merged by title (framework lots published as separate tenders
 *  read as one line), most targets first. */
export function topTenders(list: TenderDot[], n: number): TenderGroupLine[] {
  const groups = new Map<string, { tenders: string[]; contracts: number; targets: Set<string>; year: number; value: number }>();
  for (const t of list) {
    const key = t.lead.title;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { tenders: [], contracts: 0, targets: new Set(), year: t.lead.year, value: 0 }));
    g.tenders.push(t.tender);
    g.contracts += t.lots.length;
    g.value += t.value;
    g.year = Math.max(g.year, t.lead.year);
    t.targets.forEach((x) => g!.targets.add(x));
  }
  return [...groups.entries()]
    .map(([title, g]) => ({ title, tenders: g.tenders, contracts: g.contracts, targets: g.targets.size, year: g.year, value: g.value }))
    .sort((a, b) => b.targets - a.targets || b.contracts - a.contracts || b.value - a.value || a.title.localeCompare(b.title))
    .slice(0, n);
}
