import { describe, it, expect } from "vitest";
import {
  computeFinancingCoherence,
  formatBerMoney,
} from "./financing-coherence";
import type { BerData } from "@/types";

// The L2 slide runs on hard BER facts only: how much, how concentrated, how
// much unspent. No budget↔policy alignment, no taxonomy. So the compute takes
// only the BER.

function ber(overrides: Partial<BerData> = {}): BerData {
  return {
    programs: [
      { code: "1", name: "Program One", description: "", type: "environmental" },
      { code: "2", name: "Program Two", description: "", type: "environmental" },
      {
        code: "3",
        name: "Program Three",
        description: "",
        type: "non_environmental",
      },
    ],
    expenditure: [
      { code: "1", name: "Program One", values: { "2020": 10 } },
      { code: "2", name: "Program Two", values: { "2020": null } },
      { code: "3", name: "Program Three", values: { "2020": 5 } },
    ],
    currency: "MNT",
    unit: "billion",
    period: { start: 2020, end: 2020 },
    ...overrides,
  };
}

describe("computeFinancingCoherence", () => {
  it("reports true total tracked expenditure across all programs", () => {
    expect(computeFinancingCoherence(ber()).totalTrackedExpenditure).toBe(15);
  });

  it("counts total and funded programs separately", () => {
    const r = computeFinancingCoherence(ber());
    expect(r.totalProgramCount).toBe(3);
    expect(r.fundedProgramCount).toBe(2); // P2 has no spend
  });

  it("sorts programs by total spend descending and flags spend", () => {
    const r = computeFinancingCoherence(ber());
    expect(r.programs.map((p) => p.code)).toEqual(["1", "3", "2"]);
    expect(r.programs.map((p) => p.totalSpend)).toEqual([10, 5, 0]);
    expect(r.programs.find((p) => p.code === "2")!.hasSpend).toBe(false);
  });

  it("counts how few programs make up half the spend (concentration)", () => {
    // P1 alone (10 of 15) already exceeds half.
    expect(computeFinancingCoherence(ber()).programsToHalf).toBe(1);
  });

  it("needs more programs to reach half when spend is even", () => {
    const r = computeFinancingCoherence(
      ber({
        expenditure: [
          { code: "1", name: "Program One", values: { "2020": 4 } },
          { code: "2", name: "Program Two", values: { "2020": 3 } },
          { code: "3", name: "Program Three", values: { "2020": 3 } },
        ],
      }),
    );
    // total 10, half 5: 4 < 5, 4+3 >= 5 -> 2 programs.
    expect(r.programsToHalf).toBe(2);
  });

  it("exposes the BER's planned vs actual execution when present", () => {
    const r = computeFinancingCoherence(
      ber({
        keyFindings: {
          plannedBudget: 1900,
          actualExpenditure: 1200,
          gap: 700,
          programPeriod: "2015-2025",
        },
      }),
    );
    expect(r.execution).toEqual({
      planned: 1900,
      actual: 1200,
      gap: 700,
      period: "2015-2025",
    });
  });

  it("leaves execution null when the BER has no keyFindings", () => {
    expect(computeFinancingCoherence(ber()).execution).toBeNull();
  });

  it("carries currency, unit, and a hyphenated period label", () => {
    const r = computeFinancingCoherence(
      ber({ period: { start: 2020, end: 2024 } }),
    );
    expect(r.currency).toBe("MNT");
    expect(r.unit).toBe("billion");
    expect(r.periodLabel).toBe("2020-2024");
  });
});

describe("formatBerMoney", () => {
  it("rounds to a whole number for large values", () => {
    expect(formatBerMoney(889.6, "billion", "MNT")).toBe("890 billion MNT");
  });

  it("keeps one decimal for small values", () => {
    expect(formatBerMoney(5.3, "billion", "MNT")).toBe("5.3 billion MNT");
  });

  it("strips a trailing .0 on small whole values", () => {
    expect(formatBerMoney(5, "billion", "MNT")).toBe("5 billion MNT");
  });

  it("groups thousands", () => {
    expect(formatBerMoney(1234.5, "billion", "MNT")).toBe("1,235 billion MNT");
  });
});
