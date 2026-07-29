import { describe, it, expect } from "vitest";
import {
  computeBudgetCoverage,
  computeFinancingCoherence,
  computeFundingTargetRows,
  dedupeContributorSpend,
  formatBerMoney,
  groupFundingRowsByDoc,
  pickBerDescription,
  pickBerName,
} from "./financing-coherence";
import type {
  AlignmentResult,
  BerBudgetProgram,
  BerData,
  Target,
} from "@/types";

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
      programName: null,
      programNameByLocale: null,
      planned: 1900,
      actual: 1200,
      gap: 700,
      period: "2015-2025",
    });
  });

  it("carries the program name and locale map through when present", () => {
    const r = computeFinancingCoherence(
      ber({
        keyFindings: {
          programName: "National Biodiversity Program",
          programNameByLocale: {
            en: "National Biodiversity Program",
            mn: "Байгаль орчны олон янз байдлын үндэсний хөтөлбөр",
          },
          plannedBudget: 1900,
          actualExpenditure: 1200,
          gap: 700,
          programPeriod: "2015-2025",
        },
      }),
    );
    expect(r.execution?.programName).toBe("National Biodiversity Program");
    expect(r.execution?.programNameByLocale?.mn).toBe(
      "Байгаль орчны олон янз байдлын үндэсний хөтөлбөр",
    );
    // The named program's period is distinct from the year-by-year review
    // period — the two must not be conflated.
    expect(r.execution?.period).not.toBe(r.periodLabel);
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
            programBerId: "BER_1",
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
            programBerId: "BER_1",
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

describe("pickBerName", () => {
  it("returns nameEn on EN locale when present", () => {
    expect(
      pickBerName(
        { name: "Sanidad Agropecuaria", nameEn: "Agricultural Sanitation" },
        "en",
      ),
    ).toBe("Agricultural Sanitation");
  });

  it("falls back to name when nameEn is absent (Mongolia BER, older Panama files)", () => {
    expect(pickBerName({ name: "Эрчим хүч" }, "en")).toBe("Эрчим хүч");
  });

  it("returns Spanish name on ES locale regardless of nameEn", () => {
    expect(
      pickBerName(
        { name: "Sanidad Agropecuaria", nameEn: "Agricultural Sanitation" },
        "es",
      ),
    ).toBe("Sanidad Agropecuaria");
  });
});

describe("pickBerDescription", () => {
  const prog: BerBudgetProgram = {
    code: "X",
    name: "Sanidad",
    description: "LEGACY LLM input",
    descriptionEs: "Descripción en español",
    descriptionEn: "English description",
    type: "environmental",
  };

  it("prefers descriptionEn on EN locale", () => {
    expect(pickBerDescription(prog, "en")).toBe("English description");
  });

  it("prefers descriptionEs on ES locale", () => {
    expect(pickBerDescription(prog, "es")).toBe("Descripción en español");
  });

  it("falls back to legacy description when locale variant absent", () => {
    const skinny: BerBudgetProgram = {
      code: "Y",
      name: "Y",
      description: "ONLY legacy",
      type: "environmental",
    };
    expect(pickBerDescription(skinny, "en")).toBe("ONLY legacy");
    expect(pickBerDescription(skinny, "es")).toBe("ONLY legacy");
  });
});

// ── Per-target funding rows: tiers, overlap, and deduped totals ──────────────

describe("computeFundingTargetRows", () => {
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
  ): AlignmentResult {
    return { targetAId: a, targetBId: b, alignment: level, description: "" };
  }

  /** N programmes with spends N..1 (distinct after 1M rounding), each
   *  high-aligned to its own target, plus one zero-spend programme aligned to
   *  its own target. */
  function fixture(n: number) {
    const targets: Target[] = [];
    const alignment: AlignmentResult[] = [];
    const programs: BerData["programs"] = [];
    const expenditure: BerData["expenditure"] = [];
    for (let i = 1; i <= n; i++) {
      targets.push(target(`T${i}`, "NBSAP"));
      alignment.push(align(`BER_P${i}`, `T${i}`, "high"));
      programs.push({
        code: `P${i}`,
        name: `Programme ${i}`,
        description: "",
        type: "environmental",
      });
      expenditure.push({
        code: `P${i}`,
        name: `Programme ${i}`,
        values: { "2020": n - i + 1 },
      });
    }
    targets.push(target("TZERO", "NBSAP"));
    alignment.push(align("BER_PZERO", "TZERO", "high"));
    programs.push({
      code: "PZERO",
      name: "Zero-spend programme",
      description: "",
      type: "environmental",
    });
    expenditure.push({ code: "PZERO", name: "Zero-spend programme", values: { "2020": 0 } });
    const berData: BerData = {
      programs,
      expenditure,
      currency: "PAB",
      unit: "million",
      period: { start: 2020, end: 2020 },
    };
    return { targets, alignment, berData };
  }

  const baseArgs = (f: ReturnType<typeof fixture>) => ({
    targets: f.targets,
    alignment: f.alignment,
    berData: f.berData,
    countryConfig: null,
    locale: "en",
    visibleDocIds: new Set(["NBSAP"]),
  });

  it("assigns the renamed tiers: top-10 high, bottom-10 low, middle medium, zero none", () => {
    // 22 non-zero rows: spends 22..1. topCutoff = 10th largest (13),
    // bottomCutoff = 10th smallest (10) → high: 22..13, medium: 12..11,
    // low: 10..1, none: the zero-spend target.
    const rows = computeFundingTargetRows(baseArgs(fixture(22)));
    const byId = new Map(rows.map((r) => [r.targetId, r]));
    expect(byId.get("T1")!.tier).toBe("high"); // spend 22
    expect(byId.get("T10")!.tier).toBe("high"); // spend 13, at cutoff
    expect(byId.get("T11")!.tier).toBe("medium"); // spend 12
    expect(byId.get("T12")!.tier).toBe("medium"); // spend 11
    expect(byId.get("T13")!.tier).toBe("low"); // spend 10, at cutoff
    expect(byId.get("T22")!.tier).toBe("low"); // spend 1
    expect(byId.get("TZERO")!.tier).toBe("none");
    expect(byId.get("TZERO")!.alignedSpend).toBe(0);
    expect(byId.get("TZERO")!.alignedProgrammeCount).toBe(0);
  });

  it("gives targets tied at the displayed rounding the same tier", () => {
    const f = fixture(22);
    // Make T11's programme spend fractionally under T10's: rounds to the same
    // 1M bucket as the top-10 cutoff, so both must land in the same tier.
    f.berData.expenditure.find((e) => e.code === "P11")!.values["2020"] = 12.6; // rounds to 13
    const rows = computeFundingTargetRows(baseArgs(f));
    const byId = new Map(rows.map((r) => [r.targetId, r]));
    expect(byId.get("T10")!.tier).toBe(byId.get("T11")!.tier);
  });

  it("counts a shared programme's full spend under every aligned target (documented overlap)", () => {
    const f = fixture(12);
    // P1 (spend 12) also medium-aligns with T2.
    f.alignment.push(align("BER_P1", "T2", "medium"));
    const rows = computeFundingTargetRows(baseArgs(f));
    const byId = new Map(rows.map((r) => [r.targetId, r]));
    expect(byId.get("T2")!.alignedSpend).toBe(11 + 12); // own P2 + full P1
    expect(byId.get("T2")!.alignedProgrammeCount).toBe(2);
  });

  it("ignores low/none-aligned pairs as contributors", () => {
    const f = fixture(12);
    f.alignment.push(align("BER_P1", "T2", "low"));
    f.alignment.push(align("BER_P1", "T3", "none"));
    const rows = computeFundingTargetRows(baseArgs(f));
    const byId = new Map(rows.map((r) => [r.targetId, r]));
    expect(byId.get("T2")!.alignedProgrammeCount).toBe(1);
    expect(byId.get("T3")!.alignedProgrammeCount).toBe(1);
  });
});

describe("dedupeContributorSpend", () => {
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
  ): AlignmentResult {
    return { targetAId: a, targetBId: b, alignment: level, description: "" };
  }

  const berData: BerData = {
    programs: [
      { code: "P1", name: "P1", description: "", type: "environmental" },
      { code: "P2", name: "P2", description: "", type: "environmental" },
    ],
    expenditure: [
      { code: "P1", name: "P1", values: { "2020": 10 } },
      { code: "P2", name: "P2", values: { "2020": 5 } },
    ],
    currency: "PAB",
    unit: "million",
    period: { start: 2020, end: 2020 },
  };

  it("counts a programme once even when it backs several targets", () => {
    const rows = computeFundingTargetRows({
      targets: [target("T1", "NBSAP"), target("T2", "NBSAP")],
      // P1 aligns with both targets; P2 with T2 only.
      alignment: [
        align("BER_P1", "T1", "high"),
        align("BER_P1", "T2", "high"),
        align("BER_P2", "T2", "medium"),
      ],
      berData,
      countryConfig: null,
      locale: "en",
      visibleDocIds: new Set(["NBSAP"]),
    });
    // Per-target values keep the intentional overlap...
    expect(rows.reduce((s, r) => s + r.alignedSpend, 0)).toBe(10 + 10 + 5);
    // ...while the union counts P1 once.
    expect(dedupeContributorSpend(rows)).toEqual({ spend: 15, programmeCount: 2 });
  });
});

describe("groupFundingRowsByDoc", () => {
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
  ): AlignmentResult {
    return { targetAId: a, targetBId: b, alignment: level, description: "" };
  }

  it("dedupes doc totals per document while rows keep per-target overlap", () => {
    const berData: BerData = {
      programs: [
        { code: "P1", name: "P1", description: "", type: "environmental" },
        { code: "P2", name: "P2", description: "", type: "environmental" },
      ],
      expenditure: [
        { code: "P1", name: "P1", values: { "2020": 10 } },
        { code: "P2", name: "P2", values: { "2020": 5 } },
      ],
      currency: "PAB",
      unit: "million",
      period: { start: 2020, end: 2020 },
    };
    const rows = computeFundingTargetRows({
      targets: [target("A1", "NBSAP"), target("A2", "NBSAP"), target("B1", "NAP")],
      alignment: [
        // P1 backs both NBSAP targets → NBSAP total must count it once.
        align("BER_P1", "A1", "high"),
        align("BER_P1", "A2", "high"),
        align("BER_P2", "B1", "high"),
      ],
      berData,
      countryConfig: null,
      locale: "en",
      visibleDocIds: new Set(["NBSAP", "NAP"]),
    });
    const docs = groupFundingRowsByDoc(rows, null);
    const nbsap = docs.find((d) => d.docId === "NBSAP")!;
    const nap = docs.find((d) => d.docId === "NAP")!;
    expect(nbsap.docSpend).toBe(10); // NOT 20
    expect(nbsap.docProgrammeCount).toBe(1);
    expect(nbsap.rows.reduce((s, r) => s + r.alignedSpend, 0)).toBe(20); // overlap preserved per target
    expect(nap.docSpend).toBe(5);
    expect(nap.docProgrammeCount).toBe(1);
  });
});
