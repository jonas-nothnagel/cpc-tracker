import type { BriefSource } from "./source";

/**
 * Reviewed public biodiversity spending beside the targets, from a country's
 * Biodiversity Expenditure Review (BER), where the review's file also says
 * what the reviewed lines are part of (`scope.publicSpending`). Two readings:
 * the record (the reviewed lines out of all public spending in the same
 * years) and what it is for (each biodiversity area's share of the reviewed
 * spending beside its share of the targets). The amounts are the review's;
 * the area of a budget line or a target is the pipeline's primary
 * classification under GLOBE, BIOFIN's taxonomy for expenditure reviews.
 */

export interface SpendingLine {
  /** The pipeline's id, `BER_<code>`. */
  id: string;
  code: string;
  name: string;
  /** Spending per year of the review, in its unit; null where none is recorded. */
  years: Record<string, number | null>;
  total: number;
  /** Primary biodiversity area (a GLOBE category id), where it has one. */
  area: string | null;
  /** Targets the AI reads as strongly matched by the line (high only). */
  matches: string[];
}

export interface SpendingSetup {
  currency: string;
  /** The amounts' unit, e.g. "million". */
  unit: string;
  years: string[];
  /** All public spending per year, in the same currency and unit. */
  publicSpending: Record<string, number>;
  /** The figures are a demonstration country's, adapted from a real review. */
  illustrative: boolean;
  lines: SpendingLine[];
  /** The biodiversity areas, in the taxonomy's order. */
  areas: { id: string; name: string }[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * The spending record from the dashboard payload, or null where the country
 * has no review that states its public spending, or no biodiversity areas.
 */
export function spendingSetup(data: Record<string, unknown>, source: BriefSource): SpendingSetup | null {
  const ber = asRecord(data.berData);
  const scope = asRecord(ber?.scope);
  const period = asRecord(ber?.period);
  const publicRaw = asRecord(scope?.publicSpending);
  const globe = source.lenses.find((l) => l.id === "globe");
  if (!ber || !period || !publicRaw || !globe) return null;
  const start = Number(period.start);
  const end = Number(period.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const years = Array.from({ length: end - start + 1 }, (_, i) => String(start + i));
  const publicSpending: Record<string, number> = {};
  for (const y of years) {
    const v = Number(publicRaw[y]);
    if (!(v > 0)) return null;
    publicSpending[y] = v;
  }

  const area = new Map<string, string>();
  for (const c of (data.classifications as Record<string, unknown>[]) ?? []) {
    if (c.taxonomyType === "globe" && c.isPrimary) area.set(String(c.targetId), String(c.categoryId));
  }
  const known = new Set(source.commitments.map((c) => c.id));
  const matches = new Map<string, Set<string>>();
  for (const r of (data.budgetAlignment as Record<string, unknown>[]) ?? []) {
    if (r.alignment !== "high") continue;
    const a = String(r.targetAId);
    const b = String(r.targetBId);
    const [target, line] = known.has(a) ? [a, b] : known.has(b) ? [b, a] : [null, null];
    if (!target || !line) continue;
    if (!matches.has(line)) matches.set(line, new Set());
    matches.get(line)!.add(target);
  }

  const spent = new Map(
    ((ber.expenditure as Record<string, unknown>[]) ?? []).map((e) => [String(e.code), asRecord(e.values) ?? {}]),
  );
  const lines: SpendingLine[] = [];
  for (const p of (ber.programs as Record<string, unknown>[]) ?? []) {
    const code = String(p.code);
    const values = spent.get(code) ?? {};
    const byYear: Record<string, number | null> = {};
    for (const y of years) byYear[y] = typeof values[y] === "number" ? (values[y] as number) : null;
    const total = Object.values(byYear).reduce<number>((s, v) => s + (v ?? 0), 0);
    if (!(total > 0)) continue;
    const id = `BER_${code}`;
    lines.push({
      id,
      code,
      name: String(p.name ?? code),
      years: byYear,
      total,
      area: area.get(id) ?? null,
      matches: [...(matches.get(id) ?? [])],
    });
  }
  if (lines.length === 0) return null;

  return {
    currency: String(ber.currency ?? ""),
    unit: String(ber.unit ?? ""),
    years,
    publicSpending,
    illustrative: scope?.illustrative === true,
    lines,
    areas: globe.categories,
  };
}

export interface SpendingRecord {
  reviewed: number;
  public: number;
  /** Reviewed spending as a share of all public spending, 0..1. */
  share: number;
  byYear: { year: string; reviewed: number; public: number; share: number }[];
}

/** The reviewed lines out of all public spending, over the review's years and each year. */
export function spendingRecord(setup: SpendingSetup): SpendingRecord {
  const byYear = setup.years.map((year) => {
    const reviewed = setup.lines.reduce((s, l) => s + (l.years[year] ?? 0), 0);
    const all = setup.publicSpending[year];
    return { year, reviewed, public: all, share: reviewed / all };
  });
  const reviewed = byYear.reduce((s, y) => s + y.reviewed, 0);
  const all = byYear.reduce((s, y) => s + y.public, 0);
  return { reviewed, public: all, share: reviewed / all, byYear };
}

export interface SpendingArea {
  id: string;
  name: string;
  /** Targets in the brief's documents whose primary area this is. */
  targets: string[];
  /** Their share of the targets in the brief's documents, 0..1. */
  targetShare: number;
  /** Reviewed spending on lines whose primary area this is. */
  spend: number;
  /** Its share of all reviewed spending, 0..1. */
  spendShare: number;
  /** The area's budget lines, largest first. */
  lines: SpendingLine[];
  /** Its targets with at least one matching budget line (any area's). */
  matched: string[];
}

/**
 * Every biodiversity area with its share of the targets beside its share of
 * the reviewed spending, the targets read from the brief's documents. Areas
 * with neither stay out; the rest come with the most targets first, then the
 * most spending.
 */
export function spendingAreas(setup: SpendingSetup, source: BriefSource, docs: readonly string[]): SpendingArea[] {
  const globe = source.lenses.find((l) => l.id === "globe");
  const inScope = new Set(docs);
  const ids = source.commitments.filter((c) => inScope.has(c.doc)).map((c) => c.id);
  const total = ids.length;
  const reviewed = setup.lines.reduce((s, l) => s + l.total, 0);
  const matchedAll = new Set(setup.lines.flatMap((l) => l.matches));
  return setup.areas
    .map((a) => {
      const targets = ids.filter((id) => globe?.primary[id] === a.id);
      const lines = setup.lines.filter((l) => l.area === a.id).sort((x, y) => y.total - x.total || x.code.localeCompare(y.code));
      const spend = lines.reduce((s, l) => s + l.total, 0);
      return {
        id: a.id,
        name: a.name,
        targets,
        targetShare: total > 0 ? targets.length / total : 0,
        spend,
        spendShare: reviewed > 0 ? spend / reviewed : 0,
        lines,
        matched: targets.filter((id) => matchedAll.has(id)),
      };
    })
    .filter((a) => a.targets.length > 0 || a.spend > 0)
    .sort((x, y) => y.targets.length - x.targets.length || y.spend - x.spend || x.name.localeCompare(y.name));
}

/** A share as a whole percentage for labels: "<1%" for a small one above zero. */
export function percentLabel(share: number): string {
  if (!(share > 0)) return "0%";
  const pct = Math.round(share * 100);
  return pct < 1 ? "<1%" : `${pct}%`;
}
