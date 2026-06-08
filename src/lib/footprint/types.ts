/**
 * Shared footprint ledger types. The shape mirrors the Python ledger row
 * (python/src/footprint/ledger.py) so the pipeline (Python) and chat (TS) write
 * the same schema into one append-only file. Pure types only (safe to import
 * from client components).
 */

export const LEDGER_SCHEMA = 1;

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

export interface FootprintRollup {
  totals: FootprintMetrics & { call_count: number; event_count: number };
  byModel: RollupBucket[];
  byComponent: RollupBucket[];
  byRegion: RollupBucket[];
  events: LedgerEvent[];
  latestTs: string | null;
}
