/**
 * Shared footprint ledger types. The shape mirrors the Python ledger row
 * (python/src/footprint/ledger.py) so the pipeline (Python) and chat (TS) write
 * the same schema into one append-only file. Pure types only (safe to import
 * from client components).
 */

// Schema 2 (2026-08-10) adds optional per-metric min/max bounds carrying the
// EcoLogits modelled-uncertainty envelope; schema 1 rows (no bounds) stay valid.
export const LEDGER_SCHEMA = 2;

export type FootprintComponent =
  | "extract"
  | "user_pipeline"
  | "dev_pipeline"
  | "chat";

export type FootprintSource = "measured" | "estimated" | "api" | "unavailable";

/** One usage event: a pipeline run summarised per model, or a single chat message. */
export interface LedgerEvent {
  ts: string; // ISO8601 UTC, e.g. "2026-06-02T14:03:11Z"
  component: FootprintComponent;
  provider: string;
  model: string;
  region: string; // ISO 3166-1 alpha-3 electricity zone
  run_id: string | null;
  country: string | null;
  input_tokens: number | null; // chat only; pipeline rows leave null
  output_tokens: number | null;
  call_count: number;
  cached_call_count: number;
  energy_wh: number;
  water_ml: number;
  co2_geq: number; // gCO2eq
  minerals_ugsbeq: number; // ADPe
  source: FootprintSource;
  schema: number;
  // Modelled-uncertainty bounds (schema 2, optional). Absent on rows recorded
  // before August 2026 and on writers with nothing to report; readers fall
  // back to the midpoint fields above.
  energy_wh_min?: number;
  energy_wh_max?: number;
  water_ml_min?: number;
  water_ml_max?: number;
  co2_geq_min?: number;
  co2_geq_max?: number;
  minerals_ugsbeq_min?: number;
  minerals_ugsbeq_max?: number;
}

export interface FootprintMetrics {
  energy_wh: number;
  water_ml: number;
  co2_geq: number;
  minerals_ugsbeq: number;
}

/** One row of a breakdown (by model, component, region, or day). */
export interface RollupBucket extends FootprintMetrics {
  key: string;
  call_count: number;
  event_count: number;
}

/**
 * Conservative uncertainty envelope over the ledger: per metric, the sum of
 * row minima and maxima, with rows that carry no bounds contributing their
 * midpoint to both. The envelope therefore understates the true uncertainty
 * rather than inventing it; `bounded_share` says how much of the midpoint
 * total comes from rows that actually carry bounds.
 */
export interface FootprintEnvelope {
  energy_wh: { min: number; max: number };
  water_ml: { min: number; max: number };
  co2_geq: { min: number; max: number };
  minerals_ugsbeq: { min: number; max: number };
  /** Share (0..1) of the co2 midpoint total carried by rows with bounds. */
  bounded_share: number;
}

export interface FootprintRollup {
  totals: FootprintMetrics & { call_count: number; event_count: number };
  envelope: FootprintEnvelope;
  byModel: RollupBucket[];
  byComponent: RollupBucket[];
  byRegion: RollupBucket[];
  events: LedgerEvent[];
  latestTs: string | null;
}
