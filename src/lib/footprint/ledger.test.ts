import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { appendEvent, readLedger } from "./ledger";
import { ledgerPath } from "./paths";
import type { LedgerEvent } from "./types";

const base: Omit<LedgerEvent, "schema" | "ts"> = {
  component: "chat",
  provider: "openai",
  model: "gpt-5.4",
  region: "USA",
  run_id: null,
  country: null,
  input_tokens: 100,
  output_tokens: 50,
  call_count: 1,
  cached_call_count: 0,
  energy_wh: 1,
  water_ml: 2,
  co2_geq: 3,
  minerals_ugsbeq: 4,
  source: "api",
};

let dir: string;
const prev = process.env.CPC_LEDGER_DIR;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cpc-ledger-"));
  process.env.CPC_LEDGER_DIR = dir;
});

afterEach(() => {
  if (prev === undefined) delete process.env.CPC_LEDGER_DIR;
  else process.env.CPC_LEDGER_DIR = prev;
  rmSync(dir, { recursive: true, force: true });
});

describe("footprint ledger", () => {
  it("honours CPC_LEDGER_DIR in the resolved path", () => {
    expect(ledgerPath()).toBe(join(dir, "footprint-ledger.jsonl"));
  });

  it("appends an event and reads it back with schema + UTC ts", () => {
    appendEvent(base);
    const events = readLedger();
    expect(events).toHaveLength(1);
    expect(events[0].schema).toBe(1);
    expect(events[0].component).toBe("chat");
    expect(events[0].co2_geq).toBe(3);
    expect(events[0].ts).toMatch(/T\d{2}:\d{2}:\d{2}Z$/);
  });

  it("appends multiple events as separate lines", () => {
    appendEvent(base);
    appendEvent({ ...base, model: "gpt-4o-mini" });
    const events = readLedger();
    expect(events).toHaveLength(2);
    expect(new Set(events.map((e) => e.model))).toEqual(
      new Set(["gpt-5.4", "gpt-4o-mini"]),
    );
  });

  it("skips malformed lines without throwing", () => {
    appendEvent(base);
    writeFileSync(ledgerPath(), readFileSync(ledgerPath(), "utf-8") + "not json\n");
    appendEvent({ ...base, model: "gpt-4o-mini" });
    const events = readLedger();
    expect(events.map((e) => e.model).sort()).toEqual(["gpt-4o-mini", "gpt-5.4"]);
  });

  it("returns [] when the ledger does not exist", () => {
    process.env.CPC_LEDGER_DIR = join(dir, "nope");
    expect(readLedger()).toEqual([]);
  });
});
