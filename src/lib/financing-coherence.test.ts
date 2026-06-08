import { describe, it, expect } from "vitest";
import {
  computeBudgetCoverage,
  computeFinancingCoherence,
  formatBerMoney,
} from "./financing-coherence";
import type { AlignmentResult, BerData, Target } from "@/types";

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

describe("computeBudgetCoverage", () => {
  function target(id: string, doc: string): Target {
    return {
      id,
      text: `${id} text`,
      sourceDocument: doc,
      sourceLabel: id,
      country: "Testland",
      isQuantitative: false,
      isTimeBound: false,
    };
  }
  function align(
    a: string,
    b: string,
    level: AlignmentResult["alignment"],
    description = "",
  ): AlignmentResult {
    return { targetAId: a, targetBId: b, alignment: level, description };
  }

  const P1 = { berId: "BER_1", name: "Program One" };
  const P2 = { berId: "BER_2", name: "Program Two" };

  it("counts only HIGH-confidence links from a FUNDED program", () => {
    const targets = [
      target("T1", "NBSAP"),
      target("T2", "NBSAP"),
      target("T3", "NAP"),
    ];
    const alignment = [
      align("BER_1", "T1", "high"), // funded + high  -> counts
      align("BER_1", "T2", "medium"), // funded but only medium -> excluded
      align("BER_2", "T3", "high"), // high but BER_2 unfunded -> excluded
    ];
    const r = computeBudgetCoverage(alignment, [P1], targets);
    expect(r.reached).toBe(1);
    expect(r.total).toBe(3);
    // The other two ambitions sit outside this budget's reach.
    expect(r.outsideReach).toBe(2);
  });

  it("carries the strong links (target + program + why) per document", () => {
    const targets = [
      target("T1", "NBSAP"),
      target("T2", "NBSAP"),
      target("T3", "NAP"),
      target("T4", "NAP"),
      target("T5", "NAP"),
    ];
    const alignment = [
      align("BER_1", "T1", "high", "T1 funds protected areas"),
      align("BER_1", "T2", "medium"), // medium -> not a strong link
      align("BER_1", "T3", "high", "T3 funds restoration"),
    ];
    const r = computeBudgetCoverage(alignment, [P1, P2], targets);
    // NAP (3) before NBSAP (2). Only HIGH links count.
    expect(r.byDocument).toEqual([
      {
        doc: "NAP",
        reached: 1,
        total: 3,
        links: [
          {
            targetId: "T3",
            targetLabel: "T3",
            targetText: "T3 text",
            programName: "Program One",
            rationale: "T3 funds restoration",
          },
        ],
        // T4, T5 are reached by no funded programme: outside the budget's reach.
        uncovered: [
          { targetId: "T4", targetLabel: "T4", targetText: "T4 text" },
          { targetId: "T5", targetLabel: "T5", targetText: "T5 text" },
        ],
      },
      {
        doc: "NBSAP",
        reached: 1, // T2 is only medium, so NBSAP reaches 1 of 2
        total: 2,
        links: [
          {
            targetId: "T1",
            targetLabel: "T1",
            targetText: "T1 text",
            programName: "Program One",
            rationale: "T1 funds protected areas",
          },
        ],
        // T2 is only a medium match, so it sits outside the budget's reach.
        uncovered: [{ targetId: "T2", targetLabel: "T2", targetText: "T2 text" }],
      },
    ]);
    // Reached + uncovered accounts for every ambition.
    expect(r.outsideReach).toBe(3);
    for (const d of r.byDocument) {
      expect(d.links.length + d.uncovered.length).toBe(d.total);
    }
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
