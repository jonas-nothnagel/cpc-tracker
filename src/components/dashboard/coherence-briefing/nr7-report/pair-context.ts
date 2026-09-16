/**
 * The biodiversity report's context for one pair opened from it: which
 * national target the reader came from (its rating and the report's own
 * words on what holds it back), which side of the pair is the counterpart in
 * another plan, and how many national targets in the report that counterpart
 * is flagged against. Pure: the pair drawer renders it, the panel host
 * resolves it fresh on every render.
 *
 * The pair itself is between the NBSAP target the national target restates
 * and the counterpart; the report's rating is context beside the pair, never
 * its reason (the Mongolia read in sections/implementation/README.md).
 */

import type { Nr7ReportModel, Nr7TargetRow } from "./nr7-self-report";

export interface Nr7PairContext {
  /** The national target the pair was reached from. */
  row: Nr7TargetRow;
  /** The side of the pair that is not the NBSAP restatement. */
  counterpartId: string;
  /** National targets in the report whose flagged links include the
   *  counterpart (the one opened counts, so 1 means it does not repeat). */
  repeatsOn: number;
}

export function nr7PairContext(
  model: Nr7ReportModel | null | undefined,
  nationalTargetId: string,
  aId: string,
  bId: string,
): Nr7PairContext | null {
  const row = model?.targets.find((t) => t.targetId === nationalTargetId);
  if (!model || !row || !row.nbsapTargetId) return null;
  const counterpartId = row.nbsapTargetId === aId ? bId : row.nbsapTargetId === bId ? aId : null;
  if (!counterpartId) return null;
  const repeatsOn = model.targets.filter((t) => t.policyLinks?.flagged.some((l) => l.targetId === counterpartId)).length;
  return { row, counterpartId, repeatsOn };
}
