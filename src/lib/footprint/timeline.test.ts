import { describe, expect, it } from "vitest";

import { bursts, labelledBursts, placeLabels, runningTotal } from "./timeline";
import type { LedgerEvent } from "./types";

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
  call_count: 1,
  cached_call_count: 0,
  energy_wh: 0,
  water_ml: 0,
  co2_geq: 0,
  minerals_ugsbeq: 0,
  source: "measured",
  schema: 2,
  ...o,
});

describe("runningTotal", () => {
  it("adds up the resource asked for", () => {
    const steps = runningTotal(
      [
        ev({ ts: "2026-06-02T00:00:00Z", co2_geq: 100, water_ml: 7 }),
        ev({ ts: "2026-06-03T00:00:00Z", co2_geq: 50, water_ml: 30 }),
      ],
      "water_ml",
    );
    expect(steps.map((s) => [s.delta, s.total])).toEqual([
      [7, 7],
      [30, 37],
    ]);
  });

  it("adds up the carbon in the order it was recorded", () => {
    const steps = runningTotal([
      ev({ ts: "2026-07-03T00:00:00Z", co2_geq: 30 }),
      ev({ ts: "2026-06-02T00:00:00Z", co2_geq: 100 }),
      ev({ ts: "2026-06-20T00:00:00Z", co2_geq: 5 }),
    ]);
    expect(steps.map((s) => [s.ts.slice(0, 10), s.delta, s.total])).toEqual([
      ["2026-06-02", 100, 100],
      ["2026-06-20", 5, 105],
      ["2026-07-03", 30, 135],
    ]);
  });
});

describe("bursts", () => {
  it("joins runs of one use recorded within two days into one step", () => {
    const list = bursts(
      runningTotal([
        ev({ ts: "2026-06-25T19:32:00Z", co2_geq: 475 }),
        ev({ ts: "2026-06-26T02:10:00Z", co2_geq: 1202 }),
        ev({ ts: "2026-06-26T12:39:00Z", co2_geq: 9145 }),
      ]),
    );
    expect(list).toEqual([
      {
        kind: "analysis",
        country: "mongolia",
        from: "2026-06-25T19:32:00Z",
        to: "2026-06-26T12:39:00Z",
        delta: 10822,
        total: 10822,
      },
    ]);
  });

  it("starts a new step after a longer pause or when another use comes between", () => {
    const list = bursts(
      runningTotal([
        ev({ ts: "2026-06-02T07:00:00Z", co2_geq: 10 }),
        // Eight days later: a separate run.
        ev({ ts: "2026-06-10T22:00:00Z", co2_geq: 20 }),
        ev({ ts: "2026-06-11T10:00:00Z", component: "chat", country: null, co2_geq: 1 }),
        // The same analysis again, but the chat came between.
        ev({ ts: "2026-06-11T12:00:00Z", co2_geq: 40 }),
        ev({ ts: "2026-06-11T13:00:00Z", country: "panama", co2_geq: 8 }),
      ]),
    );
    expect(list.map((b) => [b.country ?? b.kind, b.delta, b.total])).toEqual([
      ["mongolia", 10, 10],
      ["mongolia", 20, 30],
      ["chat", 1, 31],
      ["mongolia", 40, 71],
      ["panama", 8, 79],
    ]);
  });
});

describe("labelledBursts", () => {
  const list = bursts(
    runningTotal([
      ev({ ts: "2026-06-02T00:00:00Z", co2_geq: 10 }),
      ev({ ts: "2026-06-10T00:00:00Z", country: "panama", co2_geq: 50 }),
      ev({ ts: "2026-06-20T00:00:00Z", country: "sri-lanka", co2_geq: 25 }),
      ev({ ts: "2026-07-01T00:00:00Z", component: "chat", country: null, co2_geq: 5 }),
      ev({ ts: "2026-07-10T00:00:00Z", co2_geq: 10 }),
    ]),
  );

  it("names the largest steps until they make up three quarters of the total, in time order", () => {
    // 50 + 25 = 75 of 100.
    expect(labelledBursts(list, 100).map((b) => b.country)).toEqual(["panama", "sri-lanka"]);
  });

  it("names no more steps than asked for", () => {
    expect(labelledBursts(list, 100, 1, 1).map((b) => b.country)).toEqual(["panama"]);
  });
});

describe("placeLabels", () => {
  it("sets a label just above its step, to the left where the line is lower", () => {
    expect(placeLabels([{ x: 300, y: 80, width: 90 }], 12)).toEqual([
      { anchor: "end", x: 296, y: 74 },
    ]);
  });

  it("turns a label to the right of its step when it would leave the chart on the left", () => {
    expect(placeLabels([{ x: 40, y: 80, width: 90 }], 12)).toEqual([
      { anchor: "start", x: 44, y: 74 },
    ]);
  });

  it("lifts a label above the highest point of the line under it", () => {
    // The line rises to y = 60 within the label's span, right of its step.
    const top = (x0: number, x1: number) => (x0 <= 120 && x1 >= 120 ? 60 : Infinity);
    expect(placeLabels([{ x: 40, y: 80, width: 90 }], 12, top)).toEqual([
      { anchor: "start", x: 44, y: 54 },
    ]);
  });

  it("leaves out a label that would cover one already placed", () => {
    expect(
      placeLabels(
        [
          { x: 300, y: 80, width: 90 },
          { x: 320, y: 84, width: 90 },
          { x: 320, y: 50, width: 90 },
        ],
        12,
      ),
    ).toEqual([
      { anchor: "end", x: 296, y: 74 },
      null,
      { anchor: "end", x: 316, y: 44 },
    ]);
  });
});
