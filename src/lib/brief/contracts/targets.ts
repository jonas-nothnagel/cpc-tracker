import type { Contract } from "./model";

/** The targets and their contracts: which have a strongly matching contract,
 *  which have none, and what else backs those (a budget line in the
 *  expenditure review, a reported action in the transparency report). */

export interface TargetStat {
  id: string;
  doc: string;
  /** Strongly matching contracts. */
  matching: number;
  matchingTenders: number;
  /** Value of the strongly matching contracts (a contract can match several targets). */
  value: number;
  /** Tenders potentially misaligned with the target. */
  misalignedTenders: number;
  /** A strongly matching budget line (BER). */
  budget: boolean;
  /** A strongly matching reported action (BTR). */
  action: boolean;
}

export function targetStats(
  contracts: Contract[],
  targets: { id: string; doc: string }[],
  budget: Set<string>,
  action: Set<string>,
): TargetStat[] {
  const matching = new Map<string, Contract[]>();
  const misaligned = new Map<string, Set<string>>();
  for (const c of contracts) {
    for (const t of c.matches) matching.set(t, [...(matching.get(t) ?? []), c]);
    for (const t of c.misaligned) {
      const s = misaligned.get(t) ?? new Set<string>();
      s.add(c.tender);
      misaligned.set(t, s);
    }
  }
  return targets.map((t) => {
    const list = matching.get(t.id) ?? [];
    return {
      id: t.id,
      doc: t.doc,
      matching: list.length,
      matchingTenders: new Set(list.map((c) => c.tender)).size,
      value: list.reduce((s, c) => s + c.value, 0),
      misalignedTenders: misaligned.get(t.id)?.size ?? 0,
      budget: budget.has(t.id),
      action: action.has(t.id),
    };
  });
}

/** Targets with this many strongly matching contracts or fewer (and at
 *  least one) are listed as thinly matched. */
export const THIN_MAX = 4;

export interface DocCoverage {
  doc: string;
  total: number;
  covered: number;
  /** Targets without a strongly matching contract. */
  none: TargetStat[];
  /** Targets with 1 to THIN_MAX strongly matching contracts. */
  thin: TargetStat[];
}

export function coverage(
  stats: TargetStat[],
  docOrder: string[],
): { docs: DocCoverage[]; covered: number; none: number; noneOfThree: number; total: number } {
  const docs = docOrder
    .map((doc) => {
      const own = stats.filter((s) => s.doc === doc);
      return {
        doc,
        total: own.length,
        covered: own.filter((s) => s.matching > 0).length,
        none: own.filter((s) => s.matching === 0),
        thin: own.filter((s) => s.matching > 0 && s.matching <= THIN_MAX),
      };
    })
    .filter((d) => d.total > 0);
  const none = stats.filter((s) => s.matching === 0);
  return {
    docs,
    covered: stats.length - none.length,
    none: none.length,
    noneOfThree: none.filter((s) => !s.budget && !s.action).length,
    total: stats.length,
  };
}
