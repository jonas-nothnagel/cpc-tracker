import { describe, expect, it } from "vitest";
import { parseContractsFile, tierTotals } from "./model";
import { contractsFixture } from "./test-fixture";

describe("parseContractsFile", () => {
  it("accepts the bake's payload", () => {
    const file = parseContractsFile(contractsFixture());
    expect(file?.census.contracts).toBe(40);
  });

  it("keeps the whole record by place, and refuses a malformed one", () => {
    const file = parseContractsFile(contractsFixture());
    expect(file?.places?.reduce((s, p) => s + p.value, 0)).toBe(250e9);
    const without: Partial<ReturnType<typeof contractsFixture>> = contractsFixture();
    delete without.places;
    expect(parseContractsFile(without)?.places).toBeUndefined();
    expect(parseContractsFile({ ...contractsFixture(), places: "x" })).toBeNull();
  });

  it("refuses anything else", () => {
    expect(parseContractsFile(null)).toBeNull();
    expect(parseContractsFile({ version: 2 })).toBeNull();
    expect(parseContractsFile({ ...contractsFixture(), contracts: "x" })).toBeNull();
  });
});

describe("tierTotals", () => {
  it("sums a tier over the years", () => {
    const file = contractsFixture();
    expect(tierTotals(file, "principal")).toEqual({ contracts: 5, value: 22e9 });
  });
});
