import type { Contract } from "./model";

/**
 * Contracts potentially misaligned with a target, counted as tenders: the
 * record lists framework agreements lot by lot, so one tender can stand for
 * hundreds of contracts. Beside each target, its strongly matching tenders.
 */

export interface TenderGroup {
  tender: string;
  contracts: Contract[];
  value: number;
  /** The largest contract of the tender, whose title stands for it. */
  lead: Contract;
}

export interface MisalignedRow {
  target: string;
  doc: string;
  tenders: TenderGroup[];
  matchingTenders: number;
}

export function misalignedRows(
  contracts: Contract[],
  docOf: Map<string, string>,
): { rows: MisalignedRow[]; tenders: number; contracts: number; topDoc: { doc: string; share: number } | null } {
  const byTarget = new Map<string, Map<string, Contract[]>>();
  const matchingTenders = new Map<string, Set<string>>();
  const tenderDocs = new Map<string, Set<string>>();
  let count = 0;
  for (const c of contracts) {
    for (const t of c.matches) {
      const s = matchingTenders.get(t) ?? new Set<string>();
      s.add(c.tender);
      matchingTenders.set(t, s);
    }
    if (c.misaligned.length === 0) continue;
    count += 1;
    for (const t of c.misaligned) {
      const groups = byTarget.get(t) ?? new Map<string, Contract[]>();
      groups.set(c.tender, [...(groups.get(c.tender) ?? []), c]);
      byTarget.set(t, groups);
      const doc = docOf.get(t);
      if (doc) {
        const docs = tenderDocs.get(c.tender) ?? new Set<string>();
        docs.add(doc);
        tenderDocs.set(c.tender, docs);
      }
    }
  }
  const rows: MisalignedRow[] = [...byTarget.entries()].map(([target, groups]) => ({
    target,
    doc: docOf.get(target) ?? "",
    matchingTenders: matchingTenders.get(target)?.size ?? 0,
    tenders: [...groups.entries()]
      .map(([tender, list]) => {
        const sorted = [...list].sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
        return { tender, contracts: sorted, value: sorted.reduce((s, c) => s + c.value, 0), lead: sorted[0] };
      })
      .sort((a, b) => b.value - a.value || a.tender.localeCompare(b.tender)),
  }));
  rows.sort((a, b) => b.tenders.length - a.tenders.length || b.matchingTenders - a.matchingTenders || a.target.localeCompare(b.target));

  const tenders = new Set(contracts.filter((c) => c.misaligned.length > 0).map((c) => c.tender)).size;
  const perDoc = new Map<string, number>();
  for (const docs of tenderDocs.values()) for (const d of docs) perDoc.set(d, (perDoc.get(d) ?? 0) + 1);
  let topDoc: { doc: string; share: number } | null = null;
  for (const [doc, n] of perDoc) {
    if (!topDoc || n > topDoc.share * tenders) topDoc = { doc, share: n / tenders };
  }
  return { rows, tenders, contracts: count, topDoc };
}
