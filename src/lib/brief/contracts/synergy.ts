import type { Contract } from "./model";

/** One contract, many targets: contracts that strongly match targets in
 *  several documents at once. */

/** Contracts serving targets in this many documents or more are listed. */
export const MIN_DOCS = 3;

export interface SynergyRow {
  contract: Contract;
  /** The documents whose targets it strongly matches, in document order. */
  docs: string[];
}

export function synergy(
  contracts: Contract[],
  docOf: Map<string, string>,
  docOrder: string[],
): { distribution: number[]; rows: SynergyRow[]; count: number; value: number } {
  const distribution = new Array<number>(docOrder.length + 1).fill(0);
  const rows: SynergyRow[] = [];
  for (const c of contracts) {
    if (c.matches.length === 0) continue;
    const served = new Set(c.matches.map((t) => docOf.get(t)).filter((d): d is string => d !== undefined));
    const docs = docOrder.filter((d) => served.has(d));
    if (docs.length === 0) continue;
    distribution[docs.length] += 1;
    if (docs.length >= MIN_DOCS) rows.push({ contract: c, docs });
  }
  rows.sort((a, b) => b.docs.length - a.docs.length || b.contract.value - a.contract.value || a.contract.id.localeCompare(b.contract.id));
  return { distribution, rows, count: rows.length, value: rows.reduce((s, r) => s + r.contract.value, 0) };
}
