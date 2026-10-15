import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { duplicateEvents } from "./integrity";
import type { LedgerEvent } from "./types";

const ev = (o: Partial<LedgerEvent>): LedgerEvent => ({
  ts: "2026-09-18T16:32:17Z",
  component: "dev_pipeline",
  provider: "openai",
  model: "gpt-5.4",
  region: "USA",
  run_id: null,
  country: "sri-lanka",
  input_tokens: null,
  output_tokens: null,
  call_count: 23853,
  cached_call_count: 233,
  energy_wh: 4726.651944,
  water_ml: 1.5,
  co2_geq: 1984.276314,
  minerals_ugsbeq: 3.2,
  source: "measured",
  schema: 2,
  ...o,
});

describe("duplicateEvents", () => {
  it("finds one event recorded twice, even when its country or run id was corrected", () => {
    const rows = [ev({}), ev({ ts: "2026-09-23T12:56:10Z" }), ev({ country: "Sri Lanka", run_id: "x" })];
    expect(duplicateEvents(rows)).toEqual([{ kind: "same-event", rows: [0, 2] }]);
  });

  it("keeps rows apart that differ in anything the event is made of", () => {
    expect(duplicateEvents([ev({}), ev({ co2_geq: 1984.3 }), ev({ cached_call_count: 0 })])).toEqual([]);
  });

  it("finds a backfill recorded twice with different figures", () => {
    const rows = [
      ev({ run_id: "backfill:nctp-procurement", co2_geq: 30000 }),
      ev({ run_id: "backfill:nctp-procurement", co2_geq: 31000 }),
      ev({ run_id: "backfill:nctp-procurement", model: "gpt-5.4-mini" }),
    ];
    expect(duplicateEvents(rows)).toEqual([{ kind: "backfill-twice", rows: [0, 1] }]);
  });

  it("finds nothing twice in the committed ledger", () => {
    const rows = readFileSync(join(process.cwd(), "python", "output", "footprint-ledger.jsonl"), "utf8")
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as LedgerEvent);
    expect(rows.length).toBeGreaterThan(0);
    expect(duplicateEvents(rows)).toEqual([]);
  });
});
