/**
 * The contracts that already serve both sides of a potential misalignment:
 * each strongly matches one target and, in a separate comparison, the other,
 * while the policy analysis rates the two targets as potentially misaligned
 * (the bake's "faultline"). They show how the two targets are reconciled in
 * practice, and are listed beside the comparison, largest first.
 */

import type { ContractsFile } from "./model";

export interface ServingBoth {
  /** Largest first; the title in English where translated. */
  contracts: { id: string; title: string; year: number; value: number }[];
  /** All of them together. */
  value: number;
}

export function servingBoth(file: ContractsFile, a: string, b: string): ServingBoth | null {
  const [x, y] = [a, b].sort();
  const ids = new Set(
    file.faultline.filter((f) => f.pairs.some(([p, q]) => p === x && q === y)).map((f) => f.contract),
  );
  const contracts = file.contracts
    .filter((c) => ids.has(c.id))
    .map((c) => ({ id: c.id, title: c.title, year: c.year, value: c.value }))
    .sort((p, q) => q.value - p.value || p.id.localeCompare(q.id));
  if (contracts.length === 0) return null;
  return { contracts, value: contracts.reduce((sum, c) => sum + c.value, 0) };
}
