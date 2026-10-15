import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { contractsFixture } from "@/lib/brief/contracts/test-fixture";

vi.mock("@/lib/dashboard-data", () => ({
  getCountryDashboardPayload: () => ({ kind: "ok", payload: { data: {} } }),
}));

vi.mock("@/lib/brief/pair", () => ({
  findPair: (_data: unknown, a: string, b: string) => ({
    pair: { targetAId: a, targetBId: b, alignment: a === "A1" && b === "C1" ? "flagged" : "high", description: "x" },
    targetA: { id: a },
    targetB: { id: b },
  }),
}));

vi.mock("@/lib/brief/contracts/load", () => ({
  loadContracts: (country: string) => (country === "mongolia" ? contractsFixture() : null),
}));

import { GET } from "./route";

const get = (query: string) => GET(new NextRequest(`http://localhost/api/brief/pair?${query}`));

describe("GET /api/brief/pair", () => {
  it("adds the contracts serving both sides of a potential misalignment", async () => {
    const body = await (await get("country=mongolia&a=A1&b=C1")).json();
    expect(body.both.contracts.map((c: { id: string }) => c.id)).toEqual(["p1"]);
  });

  it("adds none to a comparison that is not a potential misalignment", async () => {
    const body = await (await get("country=mongolia&a=A1&b=B1")).json();
    expect(body.both).toBeUndefined();
  });

  it("adds none where the country has no contract record", async () => {
    const body = await (await get("country=panama&a=A1&b=C1")).json();
    expect(body.both).toBeUndefined();
  });
});
