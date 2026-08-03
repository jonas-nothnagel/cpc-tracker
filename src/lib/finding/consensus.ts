import {
  listAvailableModels,
  loadModelFlaggedPairKeys,
} from "@/lib/dashboard-data";
import { anchorKeyOf } from "@/lib/feedback/anchor";

/**
 * Cross-model consensus for a country: per canonical pairKey, how many models
 * flag the pair. Null when fewer than two models have run (nothing to agree
 * on). Server-only (reads pipeline output from disk). Shared by the findings
 * index ranking and the finding page's significance strip.
 */
export function loadConsensusCounts(
  country: string,
): { counts: Record<string, number>; modelsTotal: number } | null {
  const models = listAvailableModels(country);
  if (models.length <= 1) return null;
  const counts: Record<string, number> = {};
  for (const keys of Object.values(loadModelFlaggedPairKeys(country))) {
    for (const raw of keys) {
      const key = anchorKeyOf(raw.split("::"));
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return { counts, modelsTotal: models.length };
}
