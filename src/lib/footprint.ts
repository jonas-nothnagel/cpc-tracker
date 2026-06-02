/**
 * Shared types and helpers for environmental footprint data.
 * The Python pipeline writes a snapshot in this shape via EcoLogits;
 * see python/src/footprint/tracker.py FootprintTracker.snapshot().
 *
 * For the cross-component usage ledger (pipeline + chat, disaggregated by
 * model/component/region), see src/lib/footprint/ and the /sustainability page.
 */

export interface FootprintSnapshot {
  energy_wh: number;
  water_ml: number;
  co2_geq: number;
  minerals_ugsbeq: number;
  call_count: number;
  tracked_call_count: number;
  cached_call_count: number;
  model: string | null;
  available: boolean;
  source?: "measured" | "estimated" | "unavailable";
}

/**
 * Format a footprint scalar for display. Returns a short string suitable
 * for inline metric chips: "<0.01" for tiny values, two decimals for
 * mid-range, integer with thousand separators for large values.
 */
export function formatFootprintValue(value: number): string {
  if (!isFinite(value) || value < 0) return "0";
  if (value === 0) return "0";
  if (value < 0.01) return "<0.01";
  if (value < 100) return value.toFixed(2);
  return Math.round(value).toLocaleString();
}
