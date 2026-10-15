import type { LedgerEvent } from "./types";

/**
 * What makes a ledger row one event: the same whitelist the deploy-time merge
 * uses (python/scripts/merge_ledger.py, `_FOOTPRINT_IDENTITY_FIELDS`), so the
 * guard and the merge agree on what "twice" means. Country, run id, schema
 * and the uncertainty bounds are metadata a row may have corrected later.
 */
const IDENTITY_FIELDS = [
  "ts",
  "component",
  "provider",
  "model",
  "region",
  "input_tokens",
  "output_tokens",
  "call_count",
  "cached_call_count",
  "energy_wh",
  "water_ml",
  "co2_geq",
  "minerals_ugsbeq",
  "source",
] as const satisfies readonly (keyof LedgerEvent)[];

export interface DuplicateEvent {
  /** `same-event`: one event recorded twice. `backfill-twice`: a backfill
   *  entered twice for the same run, model and moment, whatever its figures. */
  kind: "same-event" | "backfill-twice";
  /** Indexes of the rows involved, in ledger order. */
  rows: number[];
}

function groups(
  rows: LedgerEvent[],
  keyOf: (row: LedgerEvent, index: number) => string | null,
): number[][] {
  const seen = new Map<string, number[]>();
  rows.forEach((row, i) => {
    const key = keyOf(row, i);
    if (key === null) return;
    const list = seen.get(key);
    if (list) list.push(i);
    else seen.set(key, [i]);
  });
  return [...seen.values()].filter((list) => list.length > 1);
}

/**
 * Rows the footprint would count twice. The committed ledger is checked
 * against this in the test suite, so a merge that keeps both sides of a
 * ledger conflict fails loudly instead of inflating the page's figures.
 */
export function duplicateEvents(rows: LedgerEvent[]): DuplicateEvent[] {
  const sameEvent = groups(rows, (row) =>
    JSON.stringify(IDENTITY_FIELDS.map((field) => row[field] ?? null)),
  ).map((list) => ({ kind: "same-event" as const, rows: list }));
  const flagged = new Set(sameEvent.flatMap((d) => d.rows));
  const backfillTwice = groups(rows, (row, i) =>
    row.run_id?.startsWith("backfill:") && !flagged.has(i)
      ? JSON.stringify([row.run_id, row.model, row.ts])
      : null,
  ).map((list) => ({ kind: "backfill-twice" as const, rows: list }));
  return [...sameEvent, ...backfillTwice].sort((a, b) => a.rows[0] - b.rows[0]);
}
