import { describe, expect, it } from "vitest";

import { rollUp } from "./rollup";
import type { LedgerEvent } from "./types";

const ev = (o: Partial<LedgerEvent>): LedgerEvent => ({
  ts: "2026-06-01T00:00:00Z",
  component: "chat",
  provider: "openai",
  model: "gpt-5.4",
  region: "USA",
  run_id: null,
  country: null,
  input_tokens: null,
  output_tokens: null,
  call_count: 1,
  cached_call_count: 0,
  energy_wh: 1,
  water_ml: 2,
  co2_geq: 3,
  minerals_ugsbeq: 4,
  source: "api",
  schema: 1,
  ...o,
});

describe("rollUp", () => {
  it("computes totals and breakdowns", () => {
    const r = rollUp([
      ev({}),
      ev({ component: "user_pipeline", model: "gpt-4o-mini", co2_geq: 7, call_count: 5 }),
    ]);
    expect(r.totals.co2_geq).toBe(10);
    expect(r.totals.event_count).toBe(2);
    expect(r.totals.call_count).toBe(6);
    expect(r.byComponent.find((c) => c.key === "chat")!.co2_geq).toBe(3);
    expect(r.byModel.map((m) => m.key).sort()).toEqual(["gpt-4o-mini", "gpt-5.4"]);
    expect(r.byRegion).toHaveLength(1);
    expect(r.byDay).toHaveLength(1);
    expect(r.byDay[0].key).toBe("2026-06-01");
    expect(r.byDay[0].co2_geq).toBe(10);
  });

  it("sorts model/component/region breakdowns by co2 descending", () => {
    const r = rollUp([
      ev({ model: "small", co2_geq: 1 }),
      ev({ model: "big", co2_geq: 100 }),
    ]);
    expect(r.byModel[0].key).toBe("big");
    expect(r.byModel[1].key).toBe("small");
  });

  it("sorts byDay ascending and tracks latestTs", () => {
    const r = rollUp([
      ev({ ts: "2026-06-03T10:00:00Z" }),
      ev({ ts: "2026-06-01T10:00:00Z" }),
      ev({ ts: "2026-06-02T10:00:00Z" }),
    ]);
    expect(r.byDay.map((d) => d.key)).toEqual([
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
    ]);
    expect(r.latestTs).toBe("2026-06-03T10:00:00Z");
  });

  it("returns an empty rollup for no events", () => {
    const r = rollUp([]);
    expect(r.totals.co2_geq).toBe(0);
    expect(r.totals.event_count).toBe(0);
    expect(r.byModel).toEqual([]);
    expect(r.byDay).toEqual([]);
    expect(r.latestTs).toBeNull();
  });
});
