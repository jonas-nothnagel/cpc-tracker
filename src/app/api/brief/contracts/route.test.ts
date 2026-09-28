import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/brief/contracts/load", () => ({
  loadMisalignedFor: (country: string, target: string) =>
    country === "mongolia" && target === "C1"
      ? [{ contract: "n1", text: "Road haulage.", confidence: "high", mechanism: "goal_conflict" }]
      : country === "mongolia"
        ? []
        : null,
  loadContractRecord: (country: string, id: string) =>
    country === "mongolia" && id === "p1"
      ? { id: "p1", original: "x", english: "Green belt", strong: [{ target: "A1", text: "Matches." }], misaligned: [] }
      : null,
}));

import { GET } from "./route";

const get = (query: string) => GET(new Request(`http://localhost/api/brief/contracts?${query}`));

describe("GET /api/brief/contracts", () => {
  it("returns one contract's record", async () => {
    const res = await get("country=mongolia&contract=p1");
    expect(res.status).toBe(200);
    expect((await res.json()).strong).toHaveLength(1);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("refuses an unknown country, an unknown contract and a malformed id", async () => {
    expect((await get("country=atlantis&contract=p1")).status).toBe(404);
    expect((await get("country=mongolia&contract=p9")).status).toBe(404);
    expect((await get("country=mongolia&contract=../../etc")).status).toBe(404);
  });
});

describe("GET /api/brief/contracts?target=", () => {
  it("returns the potential-misalignment explanations for one target", async () => {
    const res = await get("country=mongolia&target=C1");
    expect(res.status).toBe(200);
    expect((await res.json()).misaligned).toEqual([{ contract: "n1", text: "Road haulage.", confidence: "high", mechanism: "goal_conflict" }]);
  });

  it("refuses a malformed target and an unknown country", async () => {
    expect((await get("country=mongolia&target=../x")).status).toBe(404);
    expect((await get("country=atlantis&target=C1")).status).toBe(404);
  });
});

