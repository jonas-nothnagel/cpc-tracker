/**
 * Which reported-action pair an NR7 national target can open: the first NR7
 * pseudo-target filed under it that has a scored pair with its NBSAP target.
 * Keyed on `nr7ParentTargetId`, which both the PDF-era and the ORT
 * pseudo-targets carry, so the map survives the alignment re-run.
 */

import type { AlignmentResult, Target } from "@/types";
import type { Nr7ReportModel } from "./nr7-self-report";

export interface Nr7PairRef {
  actionId: string;
  nbsapId: string;
}

export function nr7PairByTarget(
  model: Nr7ReportModel | null,
  targetMap: Map<string, Target>,
  actionPairTargets: Map<string, Target>,
  alignment: AlignmentResult[],
): Map<string, Nr7PairRef> {
  const map = new Map<string, Nr7PairRef>();
  if (!model) return map;
  const matches = (aId: string, bId: string) => (p: AlignmentResult) =>
    (p.targetAId === aId && p.targetBId === bId) || (p.targetAId === bId && p.targetBId === aId);
  for (const row of model.targets) {
    if (!row.nbsapTargetId || !targetMap.has(row.nbsapTargetId)) continue;
    for (const stand of actionPairTargets.values()) {
      if (stand.actionType !== "nr7") continue;
      if ((stand as { nr7ParentTargetId?: string }).nr7ParentTargetId !== row.targetId) continue;
      if (alignment.some(matches(stand.id, row.nbsapTargetId))) {
        map.set(row.targetId, { actionId: stand.id, nbsapId: row.nbsapTargetId });
        break;
      }
    }
  }
  return map;
}
