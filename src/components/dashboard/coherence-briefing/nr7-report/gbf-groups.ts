/**
 * Grouping national targets by the Kunming-Montreal GBF global target the
 * country filed each under (`gbfTargets` from the reporting tool). Pure.
 *
 * A target filed under several GBF targets lists once, under the first one
 * filed, and carries chips for the others, so the twenty national targets
 * stay twenty. Targets with no GBF reference (files that predate the field)
 * form a last group; when no target carries one, the caller keeps its flat
 * list.
 */

import type { Nr7GbfTargetRef } from "@/types";
import type { Nr7TargetRow } from "./nr7-self-report";

/** The framework has 23 global targets (decision 15/4, CBD COP15). */
export const GBF_TARGET_COUNT = 23;

export interface GbfGroup {
  /** "T03", or null for targets with no GBF reference. */
  id: string | null;
  /** The CBD's heading verbatim; null for the ungrouped rows. */
  title: string | null;
  rows: Nr7TargetRow[];
}

function gbfOrder(id: string): number {
  const m = /^T0*(\d+)$/.exec(id);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

export function groupRowsByGbfTarget(rows: Nr7TargetRow[]): {
  groups: GbfGroup[];
  /** True when at least one row carries a GBF reference. */
  hasGbf: boolean;
  /** GBF target ids (T01..T23) no national target is filed under, in order. */
  uncovered: string[];
} {
  const byId = new Map<string, GbfGroup>();
  const none: Nr7TargetRow[] = [];
  const covered = new Set<string>();
  for (const row of rows) {
    for (const g of row.gbfTargets) covered.add(g.id);
    const first: Nr7GbfTargetRef | undefined = row.gbfTargets[0];
    if (!first) {
      none.push(row);
      continue;
    }
    const group = byId.get(first.id) ?? { id: first.id, title: first.title, rows: [] };
    group.rows.push(row);
    byId.set(first.id, group);
  }
  const groups = [...byId.values()].sort((a, b) => gbfOrder(a.id!) - gbfOrder(b.id!));
  if (none.length > 0) groups.push({ id: null, title: null, rows: none });
  const uncovered: string[] = [];
  for (let n = 1; n <= GBF_TARGET_COUNT; n += 1) {
    const id = `T${String(n).padStart(2, "0")}`;
    if (!covered.has(id)) uncovered.push(id);
  }
  return { groups, hasGbf: covered.size > 0, uncovered };
}
