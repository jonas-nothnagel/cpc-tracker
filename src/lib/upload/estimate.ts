/**
 * How long an analysis takes and what it emits, from this service's own
 * measurements: its recent runs' pace in target pairs a minute, and the
 * grams of CO2e its ledger records per call. Client-safe; the server reads
 * the measurements (src/lib/upload/service.ts).
 */

/** Until the service has run an analysis of its own (July and September
 *  2026 runs on Azure gpt-5.4 compared 400 to 557 pairs a minute). */
export const DEFAULT_PAIRS_PER_MINUTE = 450;
/** 83 g CO2e per 1,000 calls, the Sri Lanka run of 18 Sep 2026. */
export const DEFAULT_GRAMS_PER_CALL = 0.083;
/** Runs smaller than this are mostly their fixed steps, not their pairs. */
const MIN_PAIRS = 500;

export interface Speed {
  pairsPerMinute: number;
  gramsPerCall: number;
}

/** The median pace of recent runs of at least 500 pairs. */
export function pairsPerMinute(history: { pairs: number; seconds: number }[]): number {
  const paces = history
    .filter((r) => r.pairs >= MIN_PAIRS && r.seconds > 0)
    .map((r) => r.pairs / (r.seconds / 60))
    .sort((a, b) => a - b);
  if (paces.length === 0) return DEFAULT_PAIRS_PER_MINUTE;
  const mid = Math.floor(paces.length / 2);
  return Math.round(paces.length % 2 ? paces[mid] : (paces[mid - 1] + paces[mid]) / 2);
}

/** Minutes and kilograms of CO2e for an analysis. The calls are one per
 *  pair, plus per target one per policy area lens and three more (its
 *  reading, its decomposition, its definition elements). */
export function estimateRun(x: { targets: number; pairs: number; lenses: number }, speed: Speed): { minutes: number; kg: number } {
  const minutes = Math.max(2, Math.ceil(x.pairs / Math.max(1, speed.pairsPerMinute)));
  const calls = x.pairs + x.targets * (x.lenses + 3);
  const kg = Math.max(0.1, Math.round((calls * speed.gramsPerCall) / 100) / 10);
  return { minutes, kg };
}
