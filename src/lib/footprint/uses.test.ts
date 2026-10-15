import { describe, expect, it } from "vitest";

import type { LedgerEvent } from "./types";
import { groupByUse, recordedSpan, regionsOf } from "./uses";

const ev = (o: Partial<LedgerEvent>): LedgerEvent => ({
  ts: "2026-06-01T00:00:00Z",
  component: "dev_pipeline",
  provider: "openai",
  model: "gpt-5.4",
  region: "USA",
  run_id: null,
  country: "mongolia",
  input_tokens: null,
  output_tokens: null,
  call_count: 10,
  cached_call_count: 0,
  energy_wh: 1,
  water_ml: 2,
  co2_geq: 3,
  minerals_ugsbeq: 4,
  source: "measured",
  schema: 2,
  ...o,
});

describe("groupByUse", () => {
  it("puts every pipeline run under its country's analysis, whoever ran it", () => {
    const groups = groupByUse([
      ev({ component: "dev_pipeline", country: "mongolia", co2_geq: 100 }),
      ev({ component: "user_pipeline", country: "mongolia", co2_geq: 20 }),
      ev({ component: "dev_pipeline", country: "panama", co2_geq: 50 }),
    ]);
    expect(groups.map((g) => [g.kind, g.country, g.co2_geq])).toEqual([
      ["analysis", "mongolia", 120],
      ["analysis", "panama", 50],
    ]);
  });

  it("keeps reading uploaded documents and the chat apart from the analyses", () => {
    const groups = groupByUse([
      ev({ component: "dev_pipeline", country: "mongolia", co2_geq: 100 }),
      // An extraction that happens to name a country is still an extraction.
      ev({ component: "extract", country: "mongolia", co2_geq: 30 }),
      ev({ component: "chat", country: null, co2_geq: 2 }),
      ev({ component: "chat", country: null, co2_geq: 1 }),
    ]);
    expect(groups.map((g) => [g.kind, g.country, g.co2_geq])).toEqual([
      ["analysis", "mongolia", 100],
      ["extract", null, 30],
      ["chat", null, 3],
    ]);
  });

  it("gives an analysis that names no country a group of its own", () => {
    const groups = groupByUse([
      ev({ country: "panama", co2_geq: 5 }),
      ev({ country: null, co2_geq: 7 }),
    ]);
    expect(groups.map((g) => [g.kind, g.country])).toEqual([
      ["analysis", null],
      ["analysis", "panama"],
    ]);
    expect(new Set(groups.map((g) => g.key)).size).toBe(2);
  });

  it("orders the uses by carbon, largest first", () => {
    const groups = groupByUse([
      ev({ component: "chat", country: null, co2_geq: 40 }),
      ev({ country: "panama", co2_geq: 10 }),
      ev({ country: "sri-lanka", co2_geq: 90 }),
    ]);
    expect(groups.map((g) => g.country ?? g.kind)).toEqual(["sri-lanka", "chat", "panama"]);
  });

  it("sums every resource, the requests and the stored answers of a group", () => {
    const [group] = groupByUse([
      ev({ energy_wh: 10, water_ml: 20, co2_geq: 4, minerals_ugsbeq: 7, call_count: 100, cached_call_count: 30 }),
      ev({ energy_wh: 1, water_ml: 2, co2_geq: 1, minerals_ugsbeq: 3, call_count: 50, cached_call_count: 0 }),
    ]);
    expect(group).toMatchObject({
      energy_wh: 11,
      water_ml: 22,
      co2_geq: 5,
      minerals_ugsbeq: 10,
      call_count: 150,
      cached_call_count: 30,
    });
  });

  it("lists a group's entries newest first and its models by carbon", () => {
    const [group] = groupByUse([
      ev({ ts: "2026-06-10T00:00:00Z", model: "gpt-5.4", co2_geq: 10 }),
      ev({ ts: "2026-08-01T00:00:00Z", model: "gpt-5.4-mini", co2_geq: 1 }),
      ev({ ts: "2026-07-01T00:00:00Z", model: "Llama-4-Maverick", co2_geq: 30 }),
      ev({ ts: "2026-06-20T00:00:00Z", model: "gpt-5.4", co2_geq: 10 }),
    ]);
    expect(group.entries.map((e) => e.ts.slice(0, 10))).toEqual([
      "2026-08-01",
      "2026-07-01",
      "2026-06-20",
      "2026-06-10",
    ]);
    expect(group.models).toEqual(["Llama-4-Maverick", "gpt-5.4", "gpt-5.4-mini"]);
  });
});

describe("recordedSpan", () => {
  it("runs from the first to the last day with an entry", () => {
    expect(
      recordedSpan([
        ev({ ts: "2026-07-02T13:31:00Z" }),
        ev({ ts: "2026-08-18T09:19:00Z" }),
        ev({ ts: "2026-06-02T07:03:00Z" }),
      ]),
    ).toEqual({ from: "2026-06-02", to: "2026-08-18" });
    expect(recordedSpan([])).toBeNull();
  });
});

describe("regionsOf", () => {
  it("names each electricity zone once, most carbon first", () => {
    expect(
      regionsOf([
        ev({ region: "USA", co2_geq: 5 }),
        ev({ region: "SWE", co2_geq: 9 }),
        ev({ region: "USA", co2_geq: 6 }),
      ]),
    ).toEqual(["USA", "SWE"]);
  });
});
