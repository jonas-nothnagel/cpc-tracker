import { describe, expect, it } from "vitest";
import { servingBoth } from "./both";
import { contractsFixture } from "./test-fixture";

describe("servingBoth", () => {
  it("lists the contracts that strongly match both targets of a potential misalignment, largest first", () => {
    const file = contractsFixture();
    file.faultline = [
      { contract: "p2", pairs: [["A1", "C1"]] },
      { contract: "p1", pairs: [["A1", "C1"], ["B1", "C1"]] },
    ];
    const both = servingBoth(file, "A1", "C1");
    expect(both?.contracts.map((c) => c.id)).toEqual(["p1", "p2"]);
    expect(both?.contracts[0]).toMatchObject({ id: "p1", year: 2024, value: 10e9 });
    expect(both?.value).toBe(14e9);
  });

  it("does not depend on which target comes first", () => {
    const file = contractsFixture();
    expect(servingBoth(file, "C1", "A1")?.contracts.map((c) => c.id)).toEqual(["p1"]);
  });

  it("gives nothing for a pair no contract serves on both sides", () => {
    expect(servingBoth(contractsFixture(), "A1", "B1")).toBeNull();
  });
});
