import { MIN_AREA_COMPARISONS, toneOf, type Scope } from "./compute";
import type { BriefCommitment, BriefSource } from "./source";
import type { SpendingLine, SpendingSetup } from "./spending";
import { targetLine } from "./text";

/**
 * The country's own 7th National Report to the Convention on Biological
 * Diversity, one row per national target, beside what the rest of the brief
 * knows about the target the row restates. Three kinds of number sit in a row
 * and never mix: the report's own (rating, indicators), the AI's readings of
 * the target against other targets (aligned, potential misalignment), and the
 * budget lines and reported actions the AI reads as strongly matching.
 *
 * A budget line counts under every target it matches, so a row's spending is
 * never summed across rows. Everything here is arithmetic; the page's detail
 * (the report's words, its indicator series) comes from /api/brief/nr7.
 */

export type Nr7RowStatus = "on_track" | "limited" | "no_progress" | "unknown";

/** Down the report's scale: the order the rows and the ratings read in. An
 *  unknown rating is off the scale. */
export const NR7_STATUS_ORDER: Nr7RowStatus[] = ["on_track", "limited", "no_progress", "unknown"];

const BEHIND: ReadonlySet<Nr7RowStatus> = new Set(["no_progress", "limited"]);

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

export interface Nr7SetupRow {
  /** "NT03". */
  id: string;
  /** "3", the country's own number for the target. */
  number: string;
  status: Nr7RowStatus;
  /** The corpus target the row restates; null when none matched. */
  targetId: string | null;
  /** The report's wording, for a row with no corpus target to name it. */
  reportText: string;
  /** Indicators the report gives for this target: series or a note, and
   *  questionnaire indicators. */
  indicators: number;
  /** Reported actions read as strongly aligned; null without reported actions. */
  actions: number | null;
  /** Budget lines read as strongly matching; null without compared lines. */
  lines: number | null;
  spend: number;
  spendUsd: number | null;
}

export interface Nr7Setup {
  rows: Nr7SetupRow[];
  /** The report's publication date, "2026-02-28". */
  publishedOn: string | null;
}

function indicatorCounts(nr7: Json): Map<string, number> {
  const seen = new Map<string, Set<string>>();
  const add = (target: string, indicator: string) => {
    const set = seen.get(target);
    if (set) set.add(indicator);
    else seen.set(target, new Set([indicator]));
  };
  for (const raw of (nr7.indicators as Json[] | undefined) ?? []) {
    const hasPoints = ((raw.series as Json[] | undefined) ?? []).some((s) => ((s.points as unknown[]) ?? []).length > 0);
    if (!hasPoints && !raw.comments) continue;
    for (const target of (raw.targetIds as string[] | undefined) ?? []) add(target, String(raw.id));
  }
  for (const answer of (asRecord(nr7.questionnaire)?.answers as Json[] | undefined) ?? []) {
    add(String(answer.targetId), String(answer.indicatorCode ?? answer.questionNumber));
  }
  return new Map([...seen].map(([target, set]) => [target, set.size]));
}

/** Reported actions (the BTR's) read as strongly aligned, per policy target;
 *  null when the country has no reported actions. */
function strongActions(data: Json): Map<string, number> | null {
  const actions = new Set(
    ((data.targets as Json[] | undefined) ?? [])
      .filter((t) => String(t.sourceDocument ?? "").startsWith("BTR"))
      .map((t) => String(t.id)),
  );
  if (actions.size === 0) return null;
  const out = new Map<string, number>();
  for (const row of (data.alignment as Json[] | undefined) ?? []) {
    if (row.alignment !== "high") continue;
    const a = String(row.targetAId);
    const b = String(row.targetBId);
    const target = actions.has(a) ? (actions.has(b) ? null : b) : actions.has(b) ? a : null;
    if (target) out.set(target, (out.get(target) ?? 0) + 1);
  }
  return out;
}

/** The section's data, or null for a country without a report. */
export function nr7Setup(data: Json, spending?: SpendingSetup | null): Nr7Setup | null {
  const nr7 = asRecord(data.nr7Data);
  const items = (nr7?.progressItems as Json[] | undefined) ?? [];
  if (!nr7 || items.length === 0) return null;
  const counts = indicatorCounts(nr7);
  const actions = strongActions(data);
  const lines = spending?.showMatches ? spending.lines : null;
  const rows = items.map((item): Nr7SetupRow => {
    const id = String(item.targetId);
    const targetId = item.nbsapTargetId ? String(item.nbsapTargetId) : null;
    const matching: SpendingLine[] = targetId && lines ? lines.filter((l) => l.matches.includes(targetId)) : [];
    const anyUsd = matching.length > 0 && matching.every((l) => l.totalUsd !== null);
    return {
      id,
      number: /^NT0*(\d+)$/.exec(id)?.[1] ?? id,
      status: NR7_STATUS_ORDER.includes(item.progressStatus as Nr7RowStatus)
        ? (item.progressStatus as Nr7RowStatus)
        : "unknown",
      targetId,
      reportText: String(item.targetText ?? ""),
      indicators: counts.get(id) ?? 0,
      actions: actions ? (targetId ? (actions.get(targetId) ?? 0) : 0) : null,
      lines: lines ? matching.length : null,
      spend: matching.reduce((s, l) => s + l.total, 0),
      spendUsd: anyUsd ? matching.reduce((s, l) => s + (l.totalUsd ?? 0), 0) : null,
    };
  });
  const source = asRecord(nr7.source);
  return { rows, publishedOn: source?.publishedOn ? String(source.publishedOn) : null };
}

export interface Nr7ReadRow extends Nr7SetupRow {
  /** The target's name for a row: its short title, or its wording clipped. */
  label: string;
  /** The target's whole wording. */
  text: string;
  /** Shares of the target's pairs with the brief's other documents; null when
   *  the target is outside them or has too few pairs to read. */
  aligned: number | null;
  apart: number | null;
  pairs: number;
}

export interface Nr7Reading {
  rows: Nr7ReadRow[];
  byStatus: Record<Nr7RowStatus, number>;
  /** Rated with limited progress or none. */
  behind: number;
}

/** A row states the target's number once: "Target 8 By 2030, ...", "Meta 8 Para
 *  2030, ..." and "NBT 1 Restore ..." come in with the number the row already
 *  shows. */
function withoutNumber(label: string, number: string): string {
  return label.replace(new RegExp(`^(?:Target|Meta|NBT|NT)\\s*0*${number}\\b[.:]?\\s*`, "i"), "") || label;
}

/** The target's short title where its label has one: "3 Protected areas" does;
 *  "Target 3" and "NBT 3" are only its number. */
function titleOf(label: string, number: string): string | null {
  return new RegExp(`^0*${number}\\b[.:]?\\s+(.+)$`).exec(label)?.[1] ?? null;
}

export function nr7Reading(setup: Nr7Setup, source: BriefSource, scope: Scope): Nr7Reading {
  const counts = new Map<string, { reinforce: number; apart: number; total: number }>();
  for (const c of scope.comparisons) {
    const tone = toneOf(c.level);
    for (const id of [c.a.id, c.b.id]) {
      const entry = counts.get(id) ?? { reinforce: 0, apart: 0, total: 0 };
      entry.total += 1;
      if (tone === "reinforce") entry.reinforce += 1;
      if (tone === "apart") entry.apart += 1;
      counts.set(id, entry);
    }
  }
  const byId = new Map(source.commitments.map((c) => [c.id, c]));
  const rows = setup.rows.map((row): Nr7ReadRow => {
    const target = row.targetId ? byId.get(row.targetId) : undefined;
    const entry = row.targetId ? counts.get(row.targetId) : undefined;
    const rated = entry !== undefined && entry.total >= MIN_AREA_COMPARISONS;
    const title = target ? titleOf(target.label, row.number) : null;
    return {
      ...row,
      label: title ?? (target ? withoutNumber(targetLine(target), row.number) : row.reportText),
      text: target?.text ?? row.reportText,
      aligned: rated ? entry.reinforce / entry.total : null,
      apart: rated ? entry.apart / entry.total : null,
      pairs: entry?.total ?? 0,
    };
  });
  const byStatus: Record<Nr7RowStatus, number> = { no_progress: 0, limited: 0, unknown: 0, on_track: 0 };
  for (const row of rows) byStatus[row.status] += 1;
  return { rows, byStatus, behind: rows.filter((r) => BEHIND.has(r.status)).length };
}

export interface Nr7Pairs {
  apart: BriefCommitment[];
  /** Strong alignments first. */
  aligned: BriefCommitment[];
}

/** One target from each document in turn, so a list's first rows show its spread. */
function acrossDocuments(scope: Scope, targets: BriefCommitment[]): BriefCommitment[] {
  const lists = scope.docs.map((d) => targets.filter((c) => c.doc === d.id));
  const out: BriefCommitment[] = [];
  for (let i = 0; out.length < targets.length; i += 1) {
    for (const list of lists) if (i < list.length) out.push(list[i]);
  }
  return out;
}

/** The targets behind a row's two shares. */
export function nr7Pairs(scope: Scope, targetId: string): Nr7Pairs {
  const apart: BriefCommitment[] = [];
  const strong: BriefCommitment[] = [];
  const moderate: BriefCommitment[] = [];
  for (const c of scope.comparisons) {
    const other = c.a.id === targetId ? c.b : c.b.id === targetId ? c.a : null;
    if (!other) continue;
    if (c.level === "flagged") apart.push(other);
    else if (c.level === "high") strong.push(other);
    else if (c.level === "medium") moderate.push(other);
  }
  return {
    apart: acrossDocuments(scope, apart),
    aligned: [...acrossDocuments(scope, strong), ...acrossDocuments(scope, moderate)],
  };
}

export type Nr7SortKey = "number" | "status" | "indicators" | "aligned" | "apart" | "lines" | "spend" | "actions";

export interface Nr7Sort {
  key: Nr7SortKey;
  /** `desc`: most advanced or most first. */
  dir: "asc" | "desc";
}

/** The rows read down the report's scale: on track first. */
export const DEFAULT_NR7_SORT: Nr7Sort = { key: "status", dir: "desc" };

/** A first pick on a column sorts it most first (the target's number reads in
 *  its own order first); a second pick turns it round. */
export function nextNr7Sort(current: Nr7Sort, key: Nr7SortKey): Nr7Sort {
  if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: key === "number" ? "asc" : "desc" };
}

function valueOf(row: Nr7ReadRow, key: Nr7SortKey, money: (row: Nr7ReadRow) => number): number | null {
  switch (key) {
    case "number":
      return Number(row.number) || 0;
    case "status":
      return row.status === "unknown" ? null : -NR7_STATUS_ORDER.indexOf(row.status);
    case "spend":
      return row.lines === null ? null : money(row);
    default:
      return row[key];
  }
}

/** Rows in a sort. A row with nothing to read goes last in either direction;
 *  ties keep the country's own numbering. `money`: a row's amount in the page's
 *  currency, so amounts rank as they are shown. */
export function sortNr7(
  rows: readonly Nr7ReadRow[],
  sort: Nr7Sort,
  money: (row: Nr7ReadRow) => number = (r) => r.spend,
): Nr7ReadRow[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = valueOf(a, sort.key, money);
    const y = valueOf(b, sort.key, money);
    if (x === null || y === null) {
      if (x !== y) return x === null ? 1 : -1;
    } else if (x !== y) {
      return (x - y) * sign;
    }
    return (Number(a.number) || 0) - (Number(b.number) || 0);
  });
}
