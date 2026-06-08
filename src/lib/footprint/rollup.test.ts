import { describe, expect, it } from "vitest";

import { cumulativeByComponent, rollUp } from "./rollup";
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
  });

  it("sorts model/component/region breakdowns by co2 descending", () => {
    const r = rollUp([
      ev({ model: "small", co2_geq: 1 }),
      ev({ model: "big", co2_geq: 100 }),
    ]);
    expect(r.byModel[0].key).toBe("big");
    expect(r.byModel[1].key).toBe("small");
  });

  it("tracks the latest timestamp", () => {
    const r = rollUp([
      ev({ ts: "2026-06-03T10:00:00Z" }),
      ev({ ts: "2026-06-01T10:00:00Z" }),
      ev({ ts: "2026-06-02T10:00:00Z" }),
    ]);
    expect(r.latestTs).toBe("2026-06-03T10:00:00Z");
  });

  it("returns an empty rollup for no events", () => {
    const r = rollUp([]);
    expect(r.totals.co2_geq).toBe(0);
    expect(r.totals.event_count).toBe(0);
    expect(r.byModel).toEqual([]);
    expect(r.latestTs).toBeNull();
  });
});

describe("cumulativeByComponent", () => {
  it("accumulates the chosen metric per component with carry-forward across days", () => {
    const { points, components } = cumulativeByComponent(
      [
        ev({ ts: "2026-06-01T10:00:00Z", component: "dev_pipeline", co2_geq: 100 }),
        ev({ ts: "2026-06-01T11:00:00Z", component: "chat", co2_geq: 1 }),
        ev({ ts: "2026-06-02T10:00:00Z", component: "dev_pipeline", co2_geq: 50 }),
      ],
      "co2_geq",
    );
    expect(components).toEqual(["dev_pipeline", "chat"]); // ordered by total desc
    expect(points).toEqual([
      { key: "2026-06-01", dev_pipeline: 100, chat: 1 },
      { key: "2026-06-02", dev_pipeline: 150, chat: 1 }, // chat carried forward
    ]);
  });

  it("works for any metric, not just carbon", () => {
    const { points } = cumulativeByComponent(
      [
        ev({ ts: "2026-06-01T10:00:00Z", component: "dev_pipeline", energy_wh: 40 }),
        ev({ ts: "2026-06-02T10:00:00Z", component: "dev_pipeline", energy_wh: 60 }),
      ],
      "energy_wh",
    );
    expect(points.map((p) => p.dev_pipeline)).toEqual([40, 100]);
  });

  it("orders components by total value descending", () => {
    const { components } = cumulativeByComponent(
      [
        ev({ component: "chat", co2_geq: 5 }),
        ev({ component: "dev_pipeline", co2_geq: 1 }),
        ev({ component: "dev_pipeline", co2_geq: 1 }),
      ],
      "co2_geq",
    );
    expect(components).toEqual(["chat", "dev_pipeline"]); // chat 5 > dev_pipeline 2
  });

  it("returns an empty series for no events", () => {
    expect(cumulativeByComponent([], "co2_geq")).toEqual({ points: [], components: [] });
  });
});
