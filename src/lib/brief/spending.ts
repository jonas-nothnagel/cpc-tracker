import { areaTones } from "./area-shares";
import { lensAreas } from "./areas";
import type { BerAreas, AreaStatus } from "./ber-areas";
import type { BerChain } from "./ber-chain-shared";
import { shownName, type BerNames } from "./ber-names-shared";
import { areaLines, countedIn, shownCurrency } from "./ber-record";
import { MIN_AREA_COMPARISONS, scopeOf, type ToneCounts } from "./compute";
import type { BriefSource } from "./source";
import type { Nr7Status } from "@/lib/labels";

/** A name as the page shows it: in the page's language where the names file
 *  gives one, a machine translation flagged, the review's own kept beside. */
interface Shown {
  name: string;
  translated?: true;
  original?: string;
}

/**
 * Reviewed public biodiversity spending beside the targets, from a country's
 * Biodiversity Expenditure Review (BER). Three readings:
 *
 *   - the record: the reviewed spending out of all public spending, by year,
 *     in the parts the review keeps apart (Mongolia's State and local budgets,
 *     Sri Lanka's core agencies and the agencies counted in part). A year whose
 *     data hold only one part has no total;
 *   - the review's own lines, largest first, each with what the review counted
 *     and why;
 *   - what it is for: each area's share of the reviewed spending beside its
 *     share of the targets. A line's area is AI-suggested until a person has
 *     checked it, and a line the AI could not place is kept apart.
 *
 * Every amount is the review's own (python/data/{country}-ber.json, built by
 * the adapters of step 1); areas come from step 2 (python/output/{country}/
 * ber_areas_globe.json, with a person's calls in python/data). Country X's
 * illustrative file predates the record and is read the earlier way.
 */

/** A part of the reviewed spending the review keeps apart. */
export type SeriesId = "central" | "local" | "core" | "other" | "all";

/** What "all public spending" is, in the review's terms. */
export type PublicScope = "stateLocal" | "publicSector" | "government" | "public";

export interface SpendingYear {
  year: string;
  /** Reviewed spending per part; null where that part is not in the review's data. */
  reviewed: Partial<Record<SeriesId, number | null>>;
  /** All public spending per part, or as one figure under "all". */
  public: Partial<Record<SeriesId, number | null>>;
  /** Every part is in the data. */
  complete: boolean;
  /** Local currency per US$; null where amounts are in US$. */
  usdRate: number | null;
}

export interface SpendingItem extends Shown {
  code: string;
  /** The review's kind of line. */
  kind: "programme" | "purpose" | "programmeGroup" | "institution" | "line";
  /** The institution, part or code that places the line. */
  sub?: string;
  /** Counted over the complete years. */
  total: number;
  /** The same in US$, each year at its own rate; null where amounts are in US$. */
  totalUsd: number | null;
  /** What the review spent and counted, by attribution rate (Mongolia). */
  rates?: { name: string; rate: number; spent: number; counted: number }[];
  /** The one rate an institution is counted at (Sri Lanka). */
  rate?: number;
  /** The review's reason for that rate. */
  rationale?: string;
  /** Who spends it, in the latest complete year. */
  bodies?: { year: string; count: number; names: { name: string; amount: number }[] };
  /** What it pays for, as shares of the counted amount. */
  pays?: { name: string; share: number }[];
  /** The activities inside a programme (Panama), largest first. */
  parts?: (Shown & { amount: number })[];
  partsCount?: number;
}

export interface SpendingLine extends Shown {
  /** The pipeline's id, `BER_<code>`. */
  id: string;
  code: string;
  /** Spending per year of the review, in its unit; null where none is recorded. */
  years: Record<string, number | null>;
  /** Counted over the complete years. */
  total: number;
  /** The line's biodiversity area (a GLOBE category id), or null while kept apart. */
  area: string | null;
  areaStatus: AreaStatus;
  /** The AI's reason for the area. */
  reason?: string;
  /** Targets the AI reads as strongly matched by the line (high only). */
  matches: string[];
}

export interface SpendingSetup {
  /** The years shown, and those with every part in the data. */
  years: SpendingYear[];
  complete: string[];
  currency: "MNT" | "LKR" | "US$";
  /** The amounts' unit. */
  unit: "billion" | "million";
  series: SeriesId[];
  scope: PublicScope;
  /** The figures are a demonstration country's, adapted from a real review. */
  illustrative: boolean;
  items: SpendingItem[];
  /** The lines the areas are read from: the review's own, or (Sri Lanka) its
   *  project lines, a second view of the same money. */
  lines: SpendingLine[];
  linesKind: "lines" | "activities" | "projects";
  /** Strong matches between lines and targets are shown (Country X's file);
   *  for a rebuilt record they wait for the rebuilt comparison. */
  showMatches: boolean;
  /** Plain-language notes the view states, by key. */
  notes: ("levels" | "panama2015" | "atPar" | "projects" | "partOfMoney")[];
  /** The biodiversity areas, in the taxonomy's order. */
  areas: { id: string; name: string }[];
  /** The national targets of the 7th National Report beside the lines they
   *  meet through a GBF target (step 3's official chain), where built. */
  progress: SpendingProgress | null;
}

export interface ProgressTarget {
  id: string;
  label: string | null;
  text: string;
  status: Nr7Status;
  /** GBF target number -> the CBD's heading, as the report gives it. */
  gbfTitles: Record<string, string>;
  nbsapTargetId: string | null;
  /** The lines with reviewed spending it meets, largest first, each with the
   *  GBF targets it meets them through and whether a person checked the
   *  line's expenditure type. */
  lines: (SpendingLine & { via: number[]; typeChecked: boolean })[];
  /** Their spending over the complete years. A line counts under every
   *  national target it meets, so these are never added across targets. */
  spend: number;
}

export interface SpendingProgress {
  /** Least advanced first, then the most spending. */
  targets: ProgressTarget[];
  /** Lines whose two readings share a GBF target, of the lines read. */
  linesLinked: number;
  linesTotal: number;
}

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const GROUP_SERIES: Record<string, SeriesId> = { CBA: "core", DBU: "core", OASBE: "other", OAMBE: "other" };
const LEVEL_SERIES: Record<string, SeriesId> = { central: "central", local: "local", all: "all" };

export interface SpendingOptions {
  /** Each line's area from step 2, with a person's calls. */
  areas?: BerAreas | null;
  /** Display names in the page's language. */
  names?: BerNames | null;
  /** The official chain to the 7th National Report (step 3). */
  chain?: BerChain | null;
  locale?: string;
}

/**
 * The spending setup from the dashboard payload, or null where the country has
 * no review with the record (or, for Country X, the public spending it is part
 * of), or no biodiversity areas.
 */
export function spendingSetup(data: Json, source: BriefSource, options: SpendingOptions = {}): SpendingSetup | null {
  const ber = asRecord(data.berData);
  const globe = source.lenses.find((l) => l.id === "globe");
  if (!ber || !globe) return null;
  const record = asRecord(ber.record);
  const show = (code: string, own: string): Shown => {
    const shown = shownName(options.names?.names[code], options.locale ?? "en");
    if (!shown || shown.name === own) return { name: own };
    return { name: shown.name, ...(shown.machine ? { translated: true as const } : {}), ...(!shown.own ? { original: own } : {}) };
  };
  return record
    ? fromRecord(record, globe.categories, options.areas ?? null, options.chain ?? null, data, source, show)
    : fromLegacy(ber, data, source, globe.categories);
}

/** Line id -> the targets the AI reads as strongly matched by it (high only). */
function strongMatches(data: Json, source: BriefSource): Map<string, Set<string>> {
  const known = new Set(source.commitments.map((c) => c.id));
  const matches = new Map<string, Set<string>>();
  for (const r of (data.budgetAlignment as Json[] | undefined) ?? []) {
    if (r.alignment !== "high") continue;
    const a = String(r.targetAId);
    const b = String(r.targetBId);
    const [target, line] = known.has(a) ? [a, b] : known.has(b) ? [b, a] : [null, null];
    if (!target || !line) continue;
    if (!matches.has(line)) matches.set(line, new Set());
    matches.get(line)!.add(target);
  }
  return matches;
}

// ---------------------------------------------------------------------------
// The record (step 1)
// ---------------------------------------------------------------------------

function fromRecord(
  record: Json,
  categories: { id: string; name: string }[],
  areas: BerAreas | null,
  chain: BerChain | null,
  data: Json,
  source: BriefSource,
  show: (code: string, own: string) => Shown,
): SpendingSetup | null {
  const rawYears = (record.years as Json[] | undefined) ?? [];
  const lines = (record.lines as Json[] | undefined) ?? [];
  const groups = Array.isArray(record.groups);
  const atPar = record.currency === "PAB";
  const currency = shownCurrency(record);
  const unit = record.unit === "billion" ? "billion" : "million";
  // The comparisons with the targets count once rebuilt for these lines (step 3).
  const showMatches = data.budgetAlignmentBasis === "ber-record";
  const matches = showMatches ? strongMatches(data, source) : new Map<string, Set<string>>();
  if (!rawYears.length || !lines.length) return null;

  const levels = ((record.levels as Json[] | undefined) ?? []).map((l) => LEVEL_SERIES[String(l.id)] ?? "all");
  const series: SeriesId[] = groups ? ["core", "other"] : levels.length ? levels : ["all"];
  const years: SpendingYear[] = rawYears.map((y) => {
    const reviewed: SpendingYear["reviewed"] = {};
    const pub: SpendingYear["public"] = {};
    const inData = new Set(((y.levels as string[] | undefined) ?? []).map((l) => LEVEL_SERIES[l] ?? "all"));
    if (groups) {
      const byGroup = asRecord(y.byGroup) ?? {};
      for (const [group, value] of Object.entries(byGroup)) {
        const s = GROUP_SERIES[group];
        if (s) reviewed[s] = (reviewed[s] ?? 0) + (num(value) ?? 0);
      }
      pub.all = num(asRecord(y.public)?.all);
    } else {
      for (const s of series) {
        reviewed[s] = inData.has(s) ? num(asRecord(y.reviewed)?.[s]) : null;
        pub[s] = inData.has(s) ? num(asRecord(y.public)?.[s]) : null;
      }
    }
    return {
      year: String(y.year),
      reviewed,
      public: pub,
      complete: y.complete === true,
      usdRate: atPar ? null : num(y.usdRate),
    };
  });
  const complete = years.filter((y) => y.complete).map((y) => y.year);
  const rate = new Map(years.map((y) => [y.year, y.usdRate]));

  const counted = countedIn;
  // US$ in whole dollars, each year at its own rate.
  const base = unit === "billion" ? 1e9 : 1e6;
  const totals = (line: Json) => {
    let total = 0;
    let usd = 0;
    for (const year of complete) {
      const value = counted(line, year);
      total += value;
      const r = rate.get(year);
      if (r) usd += (value * base) / r;
    }
    return { total, usd: atPar ? null : usd };
  };

  // The review's own lines, at the level a reader takes them in.
  const kinds = new Set(lines.map((l) => String(l.kind)));
  let items: SpendingItem[];
  if (kinds.has("activity")) {
    items = programmeItems(record, lines, totals, show);
  } else if (kinds.has("institution")) {
    items = lines
      .filter((l) => l.kind === "institution")
      .map((l) => {
        const { total, usd } = totals(l);
        const cells = Object.values(asRecord(l.amounts) ?? {}).map((c) => asRecord(asRecord(c)?.all));
        const rates = [...new Set(cells.map((c) => num(c?.rate)).filter((r): r is number => r !== null))];
        return {
          code: String(l.code),
          ...show(String(l.code), String(l.name)),
          kind: "institution" as const,
          sub: GROUP_SERIES[String(l.group)] ?? undefined,
          total,
          totalUsd: usd,
          ...(rates.length === 1 && rates[0] < 1 ? { rate: rates[0] } : {}),
          ...(typeof l.rationale === "string" ? { rationale: l.rationale } : {}),
        };
      });
  } else {
    items = lines.map((l) => ({ ...mongoliaItem(l, totals, complete), ...show(String(l.code), String(l.name)) }));
  }
  items = items.filter((i) => i.total > 0).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  // The lines the areas are read from.
  const primary = primaryGlobe(data);
  const spendingLines: SpendingLine[] = [];
  for (const l of areaLines(record)) {
    const code = String(l.code);
    const { total } = totals(l);
    if (!(total > 0)) continue;
    const byYear: Record<string, number | null> = {};
    for (const y of years) byYear[y.year] = asRecord(asRecord(l.amounts)?.[y.year]) ? counted(l, y.year) : null;
    const reading = areas?.lines[code];
    const fallback = areas ? null : (primary.get(`BER_${code}`) ?? null);
    spendingLines.push({
      id: `BER_${code}`,
      code,
      ...show(code, String(l.name)),
      years: byYear,
      total,
      area: reading ? reading.area : fallback,
      areaStatus: reading ? reading.status : fallback ? "ai" : "apart",
      ...(reading?.reason ? { reason: reading.reason } : {}),
      matches: [...(matches.get(`BER_${code}`) ?? [])],
    });
  }

  const notes: SpendingSetup["notes"] = [];
  if (series.includes("central")) notes.push("levels");
  if (atPar) notes.push("atPar", "panama2015");
  if (kinds.has("project")) notes.push("projects");
  return {
    years,
    complete,
    currency,
    unit,
    series,
    scope: groups ? "government" : series.includes("central") ? "stateLocal" : atPar ? "publicSector" : "public",
    illustrative: false,
    items,
    lines: spendingLines,
    linesKind: kinds.has("activity") ? "activities" : kinds.has("project") ? "projects" : "lines",
    showMatches,
    notes,
    areas: categories,
    progress: chain ? chainProgress(chain, spendingLines) : null,
  };
}

/** Least advanced first, as the Explore ring ranks a target's NR7 status. */
const PROGRESS_ORDER: Nr7Status[] = ["no_progress", "limited", "on_track", "unknown"];

function chainProgress(chain: BerChain, lines: SpendingLine[]): SpendingProgress | null {
  if (chain.targets.length === 0) return null;
  const byCode = new Map(lines.map((l) => [l.code, l]));
  const targets = chain.targets
    .map((t) => {
      const met = t.lines
        .map((l) => {
          const line = byCode.get(l.code);
          return line ? { ...line, via: l.via, typeChecked: chain.lines[l.code]?.checked ?? false } : null;
        })
        .filter((l): l is SpendingLine & { via: number[]; typeChecked: boolean } => l !== null)
        .sort((a, b) => b.total - a.total || a.code.localeCompare(b.code));
      return {
        id: t.id,
        label: t.label,
        text: t.text,
        status: t.status,
        gbfTitles: t.gbfTitles,
        nbsapTargetId: t.nbsapTargetId,
        lines: met,
        spend: met.reduce((s, l) => s + l.total, 0),
      };
    })
    .sort(
      (a, b) =>
        PROGRESS_ORDER.indexOf(a.status) - PROGRESS_ORDER.indexOf(b.status) ||
        b.spend - a.spend ||
        a.id.localeCompare(b.id, undefined, { numeric: true }),
    );
  return {
    targets,
    linesLinked: lines.filter((l) => chain.lines[l.code]?.linked).length,
    linesTotal: lines.length,
  };
}

function mongoliaItem(
  l: Json,
  totals: (line: Json) => { total: number; usd: number | null },
  complete: string[],
): SpendingItem {
  const { total, usd } = totals(l);
  const relevance = (l.relevance as Json[] | undefined) ?? [];
  // The review's rates, the money spent and counted at each.
  const byRate = new Map<number, { spent: number; counted: number; names: string[] }>();
  for (const r of relevance) {
    const rate = num(r.rate) ?? 0;
    const entry = byRate.get(rate) ?? { spent: 0, counted: 0, names: [] };
    entry.spent += num(r.actual) ?? 0;
    entry.counted += num(r.counted) ?? 0;
    if (typeof r.name === "string" && r.name) entry.names.push(r.name);
    byRate.set(rate, entry);
  }
  const rates = [...byRate.entries()]
    .sort((a, b) => b[1].spent - a[1].spent)
    .map(([rate, e]) => ({ rate, spent: e.spent, counted: e.counted, name: e.names[0] ?? "" }));
  const latest = [...complete].reverse().find((y) => asRecord(asRecord(l.bodies)?.[y]));
  const bodies = latest ? asRecord(asRecord(l.bodies)?.[latest]) : null;
  return {
    code: String(l.code),
    name: String(l.name),
    kind: l.kind === "purpose" ? "purpose" : "programme",
    sub: String(l.code),
    total,
    totalUsd: usd,
    ...(rates.length ? { rates } : {}),
    ...(bodies && latest
      ? {
          bodies: {
            year: latest,
            count: num(bodies.count) ?? 0,
            names: ((bodies.top as Json[] | undefined) ?? []).slice(0, 6).map((b) => ({
              name: String(b.name || b.nameMn || ""),
              amount: num(b.counted) ?? 0,
            })),
          },
        }
      : {}),
    pays: ((l.payments as Json[] | undefined) ?? []).slice(0, 4).map((p) => ({ name: String(p.name), share: num(p.share) ?? 0 })),
  };
}

function programmeItems(
  record: Json,
  lines: Json[],
  totals: (line: Json) => { total: number; usd: number | null },
  show: (code: string, own: string) => Shown,
): SpendingItem[] {
  const programmes = new Map(((record.programmes as Json[] | undefined) ?? []).map((p) => [String(p.code), p]));
  const groups = new Map<string, { total: number; usd: number; parts: NonNullable<SpendingItem["parts"]> }>();
  for (const l of lines) {
    if (l.kind !== "activity") continue;
    const key = String(l.programme);
    const { total, usd } = totals(l);
    const g = groups.get(key) ?? { total: 0, usd: 0, parts: [] };
    g.total += total;
    g.usd += usd ?? 0;
    if (total > 0) g.parts.push({ ...show(String(l.code), String(l.name)), amount: total });
    groups.set(key, g);
  }
  return [...groups.entries()].map(([code, g]) => {
    const p = programmes.get(code) ?? {};
    const parts = g.parts.sort((a, b) => b.amount - a.amount);
    return {
      code,
      ...show(code, String(p.name ?? code)),
      kind: "programmeGroup" as const,
      sub: String(p.institution ?? ""),
      total: g.total,
      totalUsd: null,
      parts: parts.slice(0, 8),
      partsCount: parts.length,
    };
  });
}

/** BER_<code> -> its primary GLOBE category, from the pipeline's classifications. */
function primaryGlobe(data: Json): Map<string, string> {
  const area = new Map<string, string>();
  for (const c of (data.classifications as Json[] | undefined) ?? []) {
    if (c.taxonomyType === "globe" && c.isPrimary) area.set(String(c.targetId), String(c.categoryId));
  }
  return area;
}

// ---------------------------------------------------------------------------
// Country X's illustrative file (the earlier shape)
// ---------------------------------------------------------------------------

function fromLegacy(ber: Json, data: Json, source: BriefSource, categories: { id: string; name: string }[]): SpendingSetup | null {
  const scope = asRecord(ber.scope);
  const period = asRecord(ber.period);
  const publicRaw = asRecord(scope?.publicSpending);
  if (!period || !publicRaw) return null;
  const start = Number(period.start);
  const end = Number(period.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const yearList = Array.from({ length: end - start + 1 }, (_, i) => String(start + i));
  for (const y of yearList) if (!(Number(publicRaw[y]) > 0)) return null;

  const area = primaryGlobe(data);
  const matches = strongMatches(data, source);

  const spent = new Map(((ber.expenditure as Json[] | undefined) ?? []).map((e) => [String(e.code), asRecord(e.values) ?? {}]));
  const lines: SpendingLine[] = [];
  for (const p of (ber.programs as Json[] | undefined) ?? []) {
    const code = String(p.code);
    const values = spent.get(code) ?? {};
    const byYear: Record<string, number | null> = {};
    for (const y of yearList) byYear[y] = typeof values[y] === "number" ? (values[y] as number) : null;
    const total = Object.values(byYear).reduce<number>((s, v) => s + (v ?? 0), 0);
    if (!(total > 0)) continue;
    const id = `BER_${code}`;
    const a = area.get(id) ?? null;
    lines.push({
      id,
      code,
      name: String(p.name ?? code),
      years: byYear,
      total,
      area: a,
      areaStatus: a ? "ai" : "apart",
      matches: [...(matches.get(id) ?? [])],
    });
  }
  if (lines.length === 0) return null;

  const years: SpendingYear[] = yearList.map((year) => ({
    year,
    reviewed: { all: lines.reduce((s, l) => s + (l.years[year] ?? 0), 0) },
    public: { all: Number(publicRaw[year]) },
    complete: true,
    usdRate: null,
  }));
  const currency = String(ber.currency ?? "US$");
  return {
    years,
    complete: yearList,
    currency: currency === "MNT" ? "MNT" : currency === "LKR" ? "LKR" : "US$",
    unit: ber.unit === "billion" ? "billion" : "million",
    series: ["all"],
    scope: "public",
    illustrative: scope?.illustrative === true,
    items: lines
      .map((l) => ({ code: l.code, name: l.name, kind: "line" as const, total: l.total, totalUsd: null }))
      .sort((a, b) => b.total - a.total),
    lines,
    linesKind: "lines",
    showMatches: true,
    notes: [],
    areas: categories,
    progress: null,
  };
}

// ---------------------------------------------------------------------------
// The readings
// ---------------------------------------------------------------------------

export interface SpendingRecord {
  /** Over the complete years: reviewed, all public spending, and the share. */
  reviewed: number;
  public: number;
  share: number;
  /** The reviewed spending in whole US$, each year at its own rate; null
   *  where amounts are in US$. */
  reviewedUsd: number | null;
  /** Each year, each part: reviewed, its own public spending, the share. */
  byYear: {
    year: string;
    complete: boolean;
    total: number | null;
    parts: { series: SeriesId; reviewed: number | null; public: number | null; share: number | null; usd: number | null }[];
  }[];
}

/** The reviewed spending out of all public spending, over the complete years and by year and part. */
export function spendingRecord(setup: SpendingSetup): SpendingRecord {
  const base = setup.unit === "billion" ? 1e9 : 1e6;
  let reviewed = 0;
  let pub = 0;
  let usd = 0;
  const byYear = setup.years.map((y) => {
    const parts = setup.series.map((s) => {
      const value = y.reviewed[s] ?? null;
      const denominator = y.public[s] ?? y.public.all ?? null;
      return {
        series: s,
        reviewed: value,
        public: denominator,
        share: value !== null && denominator ? value / denominator : null,
        usd: value !== null && y.usdRate ? (value * base) / y.usdRate : null,
      };
    });
    const total = y.complete ? parts.reduce((s, p) => s + (p.reviewed ?? 0), 0) : null;
    if (y.complete && total !== null) {
      reviewed += total;
      pub += y.public.all ?? setup.series.reduce((s, id) => s + (y.public[id] ?? 0), 0);
      if (y.usdRate) usd += (total * base) / y.usdRate;
    }
    return { year: y.year, complete: y.complete, total, parts };
  });
  return {
    reviewed,
    public: pub,
    share: pub > 0 ? reviewed / pub : 0,
    reviewedUsd: setup.currency === "US$" ? null : usd,
    byYear,
  };
}

export interface SpendingArea {
  id: string;
  name: string;
  /** Targets in the brief's documents whose primary area this is. */
  targets: string[];
  /** Their share of the targets in the brief's documents, 0..1. */
  targetShare: number;
  /** Spending on lines whose area this is, over the complete years. */
  spend: number;
  /** Its share of the spending on all the lines read for areas, 0..1. */
  spendShare: number;
  /** The area's lines, largest first. */
  lines: SpendingLine[];
  /** Its targets with at least one matching budget line (any area's). */
  matched: string[];
  /** The coherence of its targets: every target pair touching them, read
   *  as in the brief's policy areas (a pair between two areas counts for
   *  both); `rated` from the brief's floor of target pairs. */
  coherence: ToneCounts & { rated: boolean };
}

export interface SpendingAreas {
  areas: SpendingArea[];
  /** The lines kept apart: not yet placed in any area. */
  apart: { spend: number; spendShare: number; lines: SpendingLine[] };
  /** Lines whose area a person has checked, of all lines read. */
  checked: number;
}

/**
 * Every biodiversity area with its share of the targets beside its share of
 * the reviewed spending, and the coherence of its targets, the targets read
 * from the brief's documents. Areas with neither targets nor spending stay
 * out; the rest come with the most targets first, then the most spending.
 * Lines not placed in an area are counted apart.
 */
export function spendingAreas(setup: SpendingSetup, source: BriefSource, docs: readonly string[]): SpendingAreas {
  const globe = source.lenses.find((l) => l.id === "globe");
  const scope = scopeOf(source, [...docs]);
  const ids = scope.commitments.map((c) => c.id);
  const total = ids.length;
  const tones = areaTones(lensAreas(source, scope, "globe"), scope);
  const reviewed = setup.lines.reduce((s, l) => s + l.total, 0);
  const matchedAll = new Set(setup.lines.flatMap((l) => l.matches));
  const byTotal = (x: SpendingLine, y: SpendingLine) => y.total - x.total || x.code.localeCompare(y.code);
  const areas = setup.areas
    .map((a) => {
      const targets = ids.filter((id) => globe?.primary[id] === a.id);
      const lines = setup.lines.filter((l) => l.area === a.id).sort(byTotal);
      const spend = lines.reduce((s, l) => s + l.total, 0);
      const counts = tones.get(a.id) ?? { reinforce: 0, partial: 0, apart: 0, none: 0, total: 0 };
      return {
        id: a.id,
        name: a.name,
        targets,
        targetShare: total > 0 ? targets.length / total : 0,
        spend,
        spendShare: reviewed > 0 ? spend / reviewed : 0,
        lines,
        matched: targets.filter((id) => matchedAll.has(id)),
        coherence: { ...counts, rated: counts.total >= MIN_AREA_COMPARISONS },
      };
    })
    .filter((a) => a.targets.length > 0 || a.spend > 0)
    .sort((x, y) => y.targets.length - x.targets.length || y.spend - x.spend || x.name.localeCompare(y.name));
  const apartLines = setup.lines.filter((l) => l.area === null).sort(byTotal);
  const apartSpend = apartLines.reduce((s, l) => s + l.total, 0);
  return {
    areas,
    apart: { spend: apartSpend, spendShare: reviewed > 0 ? apartSpend / reviewed : 0, lines: apartLines },
    checked: setup.lines.filter((l) => l.areaStatus === "checked").length,
  };
}

/** A share as a whole percentage for labels: "<1%" for a small one above zero. */
export function percentLabel(share: number): string {
  if (!(share > 0)) return "0%";
  const pct = Math.round(share * 100);
  return pct < 1 ? "<1%" : `${pct}%`;
}
