import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { FOOTPRINT_EVENTS } from "@/data/footprint-events";
import { eventFigures, eventRows, orderedEvents, type FootprintEvent } from "./events";
import type { LedgerEvent } from "./types";

const ev = (o: Partial<LedgerEvent>): LedgerEvent => ({
  ts: "2026-06-26T12:39:00Z",
  component: "dev_pipeline",
  provider: "openai",
  model: "gpt-5.4",
  region: "USA",
  run_id: null,
  country: "mongolia",
  input_tokens: null,
  output_tokens: null,
  call_count: 100,
  cached_call_count: 0,
  energy_wh: 2,
  water_ml: 3,
  co2_geq: 1,
  minerals_ugsbeq: 4,
  source: "measured",
  schema: 2,
  ...o,
});

const words = { en: "x", es: "x", mn: "x" };
const event = (o: Partial<FootprintEvent>): FootprintEvent => ({
  id: "e",
  from: "2026-06-25T00:00:00Z",
  to: "2026-06-26T23:59:59Z",
  title: words,
  detail: words,
  source: "test",
  ...o,
});

describe("eventRows", () => {
  const ledger = [
    ev({ ts: "2026-06-24T23:59:59Z" }),
    ev({ ts: "2026-06-25T19:32:00Z", model: "gpt-5.4-mini" }),
    ev({ ts: "2026-06-26T12:39:00Z", country: "panama" }),
    ev({ ts: "2026-06-26T23:59:59Z", run_id: "backfill:translation-x", country: null }),
    ev({ ts: "2026-06-27T00:00:00Z" }),
  ];

  it("takes the rows recorded between the event's first and last moment", () => {
    expect(eventRows(event({}), ledger).map((r) => r.ts)).toEqual([
      "2026-06-25T19:32:00Z",
      "2026-06-26T12:39:00Z",
      "2026-06-26T23:59:59Z",
    ]);
  });

  it("keeps to the event's countries, where no single country is written as null", () => {
    expect(eventRows(event({ countries: ["mongolia"] }), ledger).map((r) => r.model)).toEqual(["gpt-5.4-mini"]);
    expect(eventRows(event({ countries: [null] }), ledger).map((r) => r.run_id)).toEqual(["backfill:translation-x"]);
  });

  it("keeps to the event's runs when it names them", () => {
    expect(eventRows(event({ runIds: ["backfill:translation"] }), ledger)).toHaveLength(1);
  });
});

describe("eventFigures", () => {
  it("adds up the event's requests and the chosen resource, and says when it ended", () => {
    const rows = [ev({ ts: "2026-06-25T19:32:00Z", call_count: 10, water_ml: 5 }), ev({ call_count: 30, water_ml: 7 })];
    expect(eventFigures(rows, "water_ml")).toEqual({
      requests: 40,
      amount: 12,
      first: "2026-06-25T19:32:00Z",
      last: "2026-06-26T12:39:00Z",
    });
  });
});

describe("orderedEvents", () => {
  it("numbers the events that have rows, in the order they happened", () => {
    const ledger = [ev({ ts: "2026-06-02T07:00:00Z" }), ev({ ts: "2026-06-26T12:39:00Z" })];
    const events = [
      event({ id: "late" }),
      event({ id: "empty", from: "2026-07-01T00:00:00Z", to: "2026-07-02T00:00:00Z" }),
      event({ id: "early", from: "2026-06-01T00:00:00Z", to: "2026-06-03T00:00:00Z" }),
    ];
    expect(orderedEvents(events, ledger).map((e) => [e.n, e.event.id, e.rows.length])).toEqual([
      [1, "early", 1],
      [2, "late", 1],
    ]);
  });
});

describe("the curated events", () => {
  const ledger = readFileSync(join(process.cwd(), "python", "output", "footprint-ledger.jsonl"), "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as LedgerEvent);

  it("each find their runs in the committed ledger", () => {
    for (const e of FOOTPRINT_EVENTS) expect(eventRows(e, ledger).length, e.id).toBeGreaterThan(0);
  });

  it("are written in English, Spanish and Mongolian, each once", () => {
    expect(new Set(FOOTPRINT_EVENTS.map((e) => e.id)).size).toBe(FOOTPRINT_EVENTS.length);
    for (const e of FOOTPRINT_EVENTS) {
      for (const text of [e.title, e.detail]) {
        expect([text.en, text.es, text.mn].every((s) => s.trim().length > 0), e.id).toBe(true);
        expect([text.en, text.es, text.mn].some((s) => s.includes("—")), e.id).toBe(false);
      }
      expect(e.from <= e.to, e.id).toBe(true);
    }
  });

  it("name the public contracts' English: every title, buyer and reason run of 28 and 29 September", () => {
    const event = FOOTPRINT_EVENTS.find((e) => e.id === "contracts-english");
    expect(event).toBeDefined();
    const runs = ledger.filter(
      (r) => (r.run_id === "backfill:contract-titles" || r.run_id?.startsWith("contracts-translation:")) && r.ts <= event!.to,
    );
    expect(runs.length).toBeGreaterThan(0);
    expect(eventRows(event!, ledger)).toEqual(runs);
  });

  it("never count a run twice", () => {
    const counted = FOOTPRINT_EVENTS.flatMap((e) => eventRows(e, ledger));
    expect(new Set(counted).size).toBe(counted.length);
  });
});
