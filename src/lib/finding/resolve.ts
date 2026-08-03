import { anchorKeyOf } from "@/lib/feedback/anchor";
import type { AlignmentResult, Target } from "@/types";

export interface FindingPair {
  pair: AlignmentResult;
  targetA: Target;
  targetB: Target;
  /** Canonical key: sorted target ids joined "__" (same contract as feedback anchors). */
  pairKey: string;
}

/**
 * Find the alignment record for a pairKey in the dashboard payload.
 *
 * Matching goes through `anchorKeyOf` on the record's own ids, so the key is
 * accepted in either order and the returned `pairKey` is always canonical.
 * Targets come back in the record's stored order (the order drawers display).
 * Returns null for malformed keys, unknown pairs, or unresolvable targets.
 */
export function resolveFindingPair(
  alignment: unknown[],
  targets: unknown[],
  rawPairKey: string,
): FindingPair | null {
  const key = (rawPairKey ?? "").trim();
  if (!/^[A-Za-z0-9_-]+$/.test(key) || !key.includes("__")) return null;
  // Ids never contain "__" (enforced by the anchor contract), so splitting on
  // it and re-sorting canonicalizes a reversed key; anything else matches no record.
  const canonical = anchorKeyOf(key.split("__"));

  const records = Array.isArray(alignment) ? (alignment as AlignmentResult[]) : [];
  const record = records.find(
    (r) =>
      r &&
      typeof r.targetAId === "string" &&
      typeof r.targetBId === "string" &&
      anchorKeyOf([r.targetAId, r.targetBId]) === canonical,
  );
  if (!record) return null;

  const byId = new Map<string, Target>();
  for (const t of (Array.isArray(targets) ? targets : []) as Target[]) {
    if (t && typeof t.id === "string") byId.set(t.id, t);
  }
  const targetA = byId.get(record.targetAId);
  const targetB = byId.get(record.targetBId);
  if (!targetA || !targetB) return null;

  return { pair: record, targetA, targetB, pairKey: canonical };
}
