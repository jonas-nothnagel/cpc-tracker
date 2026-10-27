import { areaTones } from "./area-shares";
import { lensAreas } from "./areas";
import type { BerAreas, AreaStatus } from "./ber-areas";
import { shownName, type BerNames } from "./ber-names-shared";
import { areaLines, countedIn, shownCurrency } from "./ber-record";
import { MIN_AREA_COMPARISONS, scopeOf, type ToneCounts } from "./compute";
import type { BriefSource } from "./source";

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
 *     and why; Panama's and Mongolia's also by institution, where the
 *     review's data say who runs or holds each line;
 *   - what it is for: each area's share of the reviewed spending beside its
 *     share of the targets. A line's area is AI-suggested until a person has
 *     checked it, and a line the AI could not place is kept apart.
 *
 * Every amount is the review's own (python/data/{country}-ber.json, built by
 * the adapters of step 1), in the review's currency, with its US$ twin at each
 * year's exchange rate where the review is not in US$; the page shows one of
 * the two. Areas come from step 2 (python/output/{country}/ber_areas_globe.json,
 * with a person's calls in python/data). Country X's illustrative file predates
 * the record and is read the earlier way.
 */

/** A part of the reviewed spending the review keeps apart. */
export type SeriesId = "central" | "local" | "core" | "other" | "all";

/** What "all public spending" is, in the review's terms. */
export type PublicScope = "stateLocal" | "publicSector" | "government" | "public";

/** The budget a programme is in (Panama's investment or operating budget). */
export type BudgetType = "investment" | "operating";

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
  kind: "programme" | "purpose" | "programmeGroup" | "institutionGroup" | "institution" | "line";
  /** The institution, part or code that places the line. */
  sub?: string;
  /** The budget a programme is in, where its institution runs another
   *  programme under the same name. */
  budget?: BudgetType;
  /** Counted over the complete years. */
  total: number;
  /** The same in whole US$, each year at its own rate; null where amounts are in US$. */
  totalUsd: number | null;
  /** What the review spent and counted in each of its categories, at that
   *  category's attribution rate (Mongolia), largest spending first. The US$
   *  twins are converted as the line's own spending is, year by year. */
  rates?: {
    code: string;
    name: string;
    rate: number;
    spent: number;
    counted: number;
    spentUsd: number | null;
    countedUsd: number | null;
  }[];
  /** The one rate an institution is counted at (Sri Lanka). */
  rate?: number;
  /** The review's reason for that rate. */
  rationale?: string;
  /** Who spends it, in the latest complete year. */
  bodies?: { year: string; count: number; names: { name: string; amount: number; amountUsd: number | null }[] };
  /** What it pays for, as shares of the counted amount. */
  pays?: { name: string; share: number }[];
  /** The activities inside a programme, or the lines inside an institution,
   *  largest first; with a US$ twin where the review is not in US$. */
  parts?: (Shown & { amount: number; amountUsd?: number | null; budget?: BudgetType })[];
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
  /** The same in whole US$, each year at its own rate; null where amounts are in US$. */
  totalUsd: number | null;
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
  /** The same spending by institution, where the review's data record who
   *  runs or holds each line (Panama's institutions, Mongolia's budget
   *  holders); absent where they do not. */
  institutions?: SpendingItem[];
  /** The lines the areas are read from: the review's own, or (Sri Lanka) its
   *  project lines, a second view of the same money. */
  lines: SpendingLine[];
  linesKind: "lines" | "activities" | "projects";
  /** Strong matches between lines and targets are shown (Country X's file);
   *  for a rebuilt record they wait for the rebuilt comparison. */
  showMatches: boolean;
  /** The notes that apply to this review, by key. Not stated on the face:
   *  their wording is kept in src/components/brief/spending/DISCLAIMERS.md. */
  notes: ("levels" | "panama2015" | "atPar" | "projects")[];
  /** The biodiversity areas, in the taxonomy's order. */
  areas: { id: string; name: string }[];
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
/** Panama's budget types, as its database writes them. */
const BUDGET_TYPES: Record<string, BudgetType> = { INVERSION: "investment", FUNCIONAMIENTO: "operating" };

export interface SpendingOptions {
  /** Each line's area from step 2, with a person's calls. */
  areas?: BerAreas | null;
  /** Display names in the page's language. */
  names?: BerNames | null;
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
    ? fromRecord(record, globe.categories, options.areas ?? null, data, source, show, options.locale ?? "en")
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
  data: Json,
  source: BriefSource,
  show: (code: string, own: string) => Shown,
  locale: string,
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
  const inUsd = (value: number, year: string): number | null => {
    const r = rate.get(year);
    return atPar || !r ? null : (value * base) / r;
  };
  const totals = (line: Json) => {
    let total = 0;
    let usd = 0;
    for (const year of complete) {
      const value = counted(line, year);
      total += value;
      usd += inUsd(value, year) ?? 0;
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
        // "Counted in full" or "in part" by the rates the review applies, not
        // by its group: an agency of the other groups may be counted in full
        // (Sri Lanka Customs' biodiversity division, at 100%).
        const inFull = rates.length ? rates.every((r) => r >= 1) : GROUP_SERIES[String(l.group)] === "core";
        return {
          code: String(l.code),
          ...show(String(l.code), String(l.name)),
          kind: "institution" as const,
          sub: inFull ? "core" : "other",
          total,
          totalUsd: usd,
          ...(rates.length === 1 && rates[0] < 1 ? { rate: rates[0] } : {}),
          ...(typeof l.rationale === "string" ? { rationale: l.rationale } : {}),
        };
      });
  } else {
    items = lines.map((l) => ({ ...mongoliaItem(l, totals, complete, inUsd, locale), ...show(String(l.code), String(l.name)) }));
  }
  items = items.filter((i) => i.total > 0).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const institutions = kinds.has("activity")
    ? institutionItems(record, items, show)
    : kinds.has("programme")
      ? holderItems(lines, complete, inUsd, show)
      : [];

  // The lines the areas are read from.
  const primary = primaryGlobe(data);
  const spendingLines: SpendingLine[] = [];
  for (const l of areaLines(record)) {
    const code = String(l.code);
    const { total, usd } = totals(l);
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
      totalUsd: usd,
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
    ...(institutions.length ? { institutions } : {}),
    lines: spendingLines,
    linesKind: kinds.has("activity") ? "activities" : kinds.has("project") ? "projects" : "lines",
    showMatches,
    notes,
    areas: categories,
  };
}

function mongoliaItem(
  l: Json,
  totals: (line: Json) => { total: number; usd: number | null },
  complete: string[],
  inUsd: (value: number, year: string) => number | null,
  locale: string,
): SpendingItem {
  const { total, usd } = totals(l);
  // The review's rates hold totals over the complete years, so their US$
  // twins take the line's own conversion: each year's rate, weighted as the
  // line's spending is.
  const factor = usd !== null && total > 0 ? usd / total : null;
  // A category, payment or spending unit as the review names it in the
  // page's language: its own Mongolian on the Mongolian page.
  const named = (x: Json) => {
    const mn = locale === "mn" && typeof x.nameMn === "string" ? x.nameMn : "";
    return String(mn || x.name || x.nameMn || "");
  };
  const relevance = (l.relevance as Json[] | undefined) ?? [];
  // Each of the review's categories with its own rate, the money spent and
  // counted in it: several categories may share a rate, and each keeps its
  // own name and amounts.
  const rates = relevance
    .map((r) => {
      const spent = num(r.actual) ?? 0;
      const counted = num(r.counted) ?? 0;
      return {
        code: String(r.code ?? ""),
        name: named(r),
        rate: num(r.rate) ?? 0,
        spent,
        counted,
        spentUsd: factor === null ? null : spent * factor,
        countedUsd: factor === null ? null : counted * factor,
      };
    })
    .sort((a, b) => b.spent - a.spent || b.rate - a.rate || a.name.localeCompare(b.name));
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
            names: ((bodies.top as Json[] | undefined) ?? []).slice(0, 6).map((b) => {
              const amount = num(b.counted) ?? 0;
              return { name: named(b), amount, amountUsd: inUsd(amount, latest) };
            }),
          },
        }
      : {}),
    pays: ((l.payments as Json[] | undefined) ?? []).slice(0, 4).map((p) => ({ name: named(p), share: num(p.share) ?? 0 })),
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
  // An institution may run a programme under one name in each budget (Panama's
  // environment ministry): the two are told apart by the budget they are in.
  const placed = (code: string) => {
    const p = programmes.get(code) ?? {};
    return `${String(p.institutionCode ?? p.institution ?? "")}|${String(p.name ?? code)}`;
  };
  const named = new Map<string, number>();
  for (const [code, g] of groups) if (g.total > 0) named.set(placed(code), (named.get(placed(code)) ?? 0) + 1);
  return [...groups.entries()].map(([code, g]) => {
    const p = programmes.get(code) ?? {};
    const parts = g.parts.sort((a, b) => b.amount - a.amount);
    const institution = String(p.institution ?? "");
    const budget = (named.get(placed(code)) ?? 0) > 1 ? BUDGET_TYPES[String(p.type)] : undefined;
    return {
      code,
      ...show(code, String(p.name ?? code)),
      ...(budget ? { budget } : {}),
      kind: "programmeGroup" as const,
      sub: p.institutionCode ? show(String(p.institutionCode), institution).name : institution,
      total: g.total,
      totalUsd: null,
      parts: parts.slice(0, 8),
      partsCount: parts.length,
    };
  });
}

/** Panama's programmes gathered by the institution that runs them, by the
 *  database's own institution code, each holding its programmes largest
 *  first. None where a programme carries no code: the list then has the one
 *  view. */
function institutionItems(record: Json, programmes: SpendingItem[], show: (code: string, own: string) => Shown): SpendingItem[] {
  const names = new Map(((record.institutions as Json[] | undefined) ?? []).map((i) => [String(i.code), String(i.name)]));
  const codeOf = new Map(((record.programmes as Json[] | undefined) ?? []).map((p) => [String(p.code), p.institutionCode]));
  const groups = new Map<string, SpendingItem[]>();
  for (const programme of programmes) {
    const code = codeOf.get(programme.code);
    if (typeof code !== "string" || !names.has(code)) return [];
    groups.set(code, [...(groups.get(code) ?? []), programme]);
  }
  return [...groups.entries()]
    .map(([code, inside]) => ({
      code,
      ...show(code, names.get(code)!),
      kind: "institutionGroup" as const,
      total: inside.reduce((s, p) => s + p.total, 0),
      totalUsd: inside.some((p) => p.totalUsd === null) ? null : inside.reduce((s, p) => s + (p.totalUsd ?? 0), 0),
      parts: inside.map(({ name, translated, original, budget, total }) => ({
        name,
        ...(translated ? { translated } : {}),
        ...(original ? { original } : {}),
        ...(budget ? { budget } : {}),
        amount: total,
      })),
      partsCount: inside.length,
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

/** Mongolia's lines gathered by who holds their budget (the workbook's own
 *  budget holders: ministers, the capital city, the provinces) over the
 *  complete years, each holding its lines largest first, every amount with its
 *  US$ twin at its own year's rate. None where a line carries no holders: the
 *  list then has the one view. */
function holderItems(
  lines: Json[],
  complete: string[],
  inUsd: (value: number, year: string) => number | null,
  show: (code: string, own: string) => Shown,
): SpendingItem[] {
  type Sum = { amount: number; usd: number | null };
  const add = (sum: Sum, amount: number, usd: number | null) => {
    sum.amount += amount;
    sum.usd = sum.usd === null || usd === null ? null : sum.usd + usd;
  };
  const groups = new Map<string, { name: string; sum: Sum; parts: Map<string, Sum> }>();
  for (const l of lines) {
    const byYear = asRecord(l.holders);
    if (!byYear) return [];
    for (const year of complete) {
      for (const h of (byYear[year] as Json[] | undefined) ?? []) {
        const amount = num(h.counted) ?? 0;
        const usd = inUsd(amount, year);
        const code = String(h.code);
        const group = groups.get(code) ?? { name: String(h.name || h.nameMn || code), sum: { amount: 0, usd: 0 }, parts: new Map<string, Sum>() };
        add(group.sum, amount, usd);
        const part = group.parts.get(String(l.code)) ?? { amount: 0, usd: 0 };
        add(part, amount, usd);
        group.parts.set(String(l.code), part);
        groups.set(code, group);
      }
    }
  }
  const named = new Map(lines.map((l) => [String(l.code), show(String(l.code), String(l.name))]));
  return [...groups.entries()]
    .map(([code, group]) => {
      const parts = [...group.parts.entries()]
        .filter(([, p]) => p.amount > 0)
        .sort((a, b) => b[1].amount - a[1].amount)
        .map(([line, p]) => ({ ...named.get(line)!, amount: p.amount, amountUsd: p.usd }));
      return {
        code,
        ...show(code, group.name),
        kind: "institutionGroup" as const,
        total: group.sum.amount,
        totalUsd: group.sum.usd,
        parts,
        partsCount: parts.length,
      };
    })
    .filter((i) => i.total > 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
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
      totalUsd: null,
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
  /** The same two in whole US$, each year at its own rate; null where
   *  amounts are in US$. */
  reviewedUsd: number | null;
  publicUsd: number | null;
  /** Each year, each part: reviewed, its own public spending, the share. */
  byYear: {
    year: string;
    complete: boolean;
    /** All parts together, in a year that holds every part. */
    total: number | null;
    totalUsd: number | null;
    parts: { series: SeriesId; reviewed: number | null; public: number | null; share: number | null; usd: number | null }[];
  }[];
}

/** The reviewed spending out of all public spending, over the complete years and by year and part. */
export function spendingRecord(setup: SpendingSetup): SpendingRecord {
  const base = setup.unit === "billion" ? 1e9 : 1e6;
  const inUsd = (value: number, rate: number | null) => (rate ? (value * base) / rate : null);
  let reviewed = 0;
  let pub = 0;
  let usd = 0;
  let pubUsd = 0;
  const byYear = setup.years.map((y) => {
    const parts = setup.series.map((s) => {
      const value = y.reviewed[s] ?? null;
      const denominator = y.public[s] ?? y.public.all ?? null;
      return {
        series: s,
        reviewed: value,
        public: denominator,
        share: value !== null && denominator ? value / denominator : null,
        usd: value !== null ? inUsd(value, y.usdRate) : null,
      };
    });
    const total = y.complete ? parts.reduce((s, p) => s + (p.reviewed ?? 0), 0) : null;
    if (y.complete && total !== null) {
      const yearPublic = y.public.all ?? setup.series.reduce((s, id) => s + (y.public[id] ?? 0), 0);
      reviewed += total;
      pub += yearPublic;
      usd += inUsd(total, y.usdRate) ?? 0;
      pubUsd += inUsd(yearPublic, y.usdRate) ?? 0;
    }
    return { year: y.year, complete: y.complete, total, totalUsd: total !== null ? inUsd(total, y.usdRate) : null, parts };
  });
  const local = setup.currency !== "US$";
  return {
    reviewed,
    public: pub,
    share: pub > 0 ? reviewed / pub : 0,
    reviewedUsd: local ? usd : null,
    publicUsd: local ? pubUsd : null,
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
  /** The same in whole US$; null where amounts are in US$. */
  spendUsd: number | null;
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
  apart: { spend: number; spendUsd: number | null; spendShare: number; lines: SpendingLine[] };
}

/** The US$ twin of a set of lines' spending; null where amounts are in US$. */
function usdOf(lines: SpendingLine[]): number | null {
  return lines.some((l) => l.totalUsd === null) ? null : lines.reduce((s, l) => s + (l.totalUsd ?? 0), 0);
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
        spendUsd: lines.length ? usdOf(lines) : setup.currency === "US$" ? null : 0,
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
    apart: {
      spend: apartSpend,
      spendUsd: apartLines.length ? usdOf(apartLines) : setup.currency === "US$" ? null : 0,
      spendShare: reviewed > 0 ? apartSpend / reviewed : 0,
      lines: apartLines,
    },
  };
}

/** A share as a whole percentage for labels: "<1%" for a small one above zero. */
export function percentLabel(share: number): string {
  if (!(share > 0)) return "0%";
  const pct = Math.round(share * 100);
  return pct < 1 ? "<1%" : `${pct}%`;
}
