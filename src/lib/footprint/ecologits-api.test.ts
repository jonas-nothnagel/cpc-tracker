import { afterEach, describe, expect, it, vi } from "vitest";

import { estimateChatImpacts, midpoint } from "./ecologits-api";

// A trimmed copy of a real /v1beta/estimations response (gpt-4o, 200 tokens).
const SAMPLE_RESPONSE = {
  impacts: {
    energy: { value: { min: 0.0002, max: 0.0004 }, unit: "kWh" },
    gwp: { value: { min: 0.0001, max: 0.0002 }, unit: "kgCO2eq" },
    adpe: { value: { min: 3.0e-10, max: 3.4e-10 }, unit: "kgSbeq" },
    wcf: { value: { min: 0.001, max: 0.003 }, unit: "L" },
    usage: {
      wcf: { value: { min: 0.001, max: 0.002 }, unit: "L" },
    },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("midpoint", () => {
  it("averages a RangeValue", () => {
    expect(midpoint({ value: { min: 2, max: 4 } })).toBe(3);
  });
  it("passes through a scalar value", () => {
    expect(midpoint({ value: 5 })).toBe(5);
  });
  it("returns 0 for missing fields", () => {
    expect(midpoint(undefined)).toBe(0);
    expect(midpoint(null)).toBe(0);
  });
});

describe("estimateChatImpacts", () => {
  it("parses the hosted response and converts units, water from usage.wcf", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => SAMPLE_RESPONSE,
      })),
    );
    const out = await estimateChatImpacts({
      model: "gpt-5.4",
      outputTokens: 200,
      zone: "USA",
    });
    expect(out.source).toBe("api");
    // energy midpoint 0.0003 kWh -> 0.3 Wh
    expect(out.energy_wh).toBeCloseTo(0.3, 6);
    // gwp midpoint 0.00015 kgCO2eq -> 0.15 gCO2eq
    expect(out.co2_geq).toBeCloseTo(0.15, 6);
    // water from usage.wcf midpoint 0.0015 L -> 1.5 mL (not the top-level wcf 0.002)
    expect(out.water_ml).toBeCloseTo(1.5, 6);
  });

  it("sends only token count + model name (no prompt content)", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      void init;
      return { ok: true, json: async () => SAMPLE_RESPONSE };
    });
    vi.stubGlobal("fetch", fetchMock);
    await estimateChatImpacts({ model: "openai/gpt-4o-mini", outputTokens: 42, zone: "USA" });
    const init = fetchMock.mock.calls[0][1];
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      provider: "openai",
      model_name: "gpt-4o-mini", // openai/ prefix stripped
      output_token_count: 42,
      electricity_mix_zone: "USA",
    });
  });

  it("returns an unavailable fallback on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    const out = await estimateChatImpacts({ model: "gpt-5.4", outputTokens: 10 });
    expect(out.source).toBe("unavailable");
    expect(out.co2_geq).toBe(0);
  });

  it("returns an unavailable fallback when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));
    const out = await estimateChatImpacts({ model: "gpt-5.4", outputTokens: 10 });
    expect(out.source).toBe("unavailable");
  });
});
