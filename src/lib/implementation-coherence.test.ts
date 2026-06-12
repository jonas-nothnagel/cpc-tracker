import { describe, it, expect } from "vitest";
import {
  buildActionMeta,
  computeActionPlanAlignment,
  computeDeliveryRoster,
  computeImplementationCoverage,
  computeInstitutionFlow,
  isUnderWay,
  normalizeOrg,
  nr7StatusByNbsapTarget,
  orgLabelsFor,
} from "./implementation-coherence";
import type { AlignmentResult, BTRAction, BtrData, Target } from "@/types";

function mit(name: string, overrides: Partial<BTRAction> = {}): BTRAction {
  return {
    name,
    description: "",
    objectives: "",
    instrumentType: "",
    status: "Adopted",
    sector: "sector_energy",
    gasesAffected: "",
    startYear: "",
    implementingEntity: "Ministry of Energy",
    reductionEstimates: {},
    actionType: "mitigation",
    ...overrides,
  };
}

function adapt(id: string, name: string, overrides: Partial<BTRAction> = {}): BTRAction {
  return {
    ...mit(name),
    actionType: "adaptation",
    adaptationGoal: 3,
    responsibleOrgs: ["MOFALI"],
    ...({ id } as object),
    ...overrides,
  } as BTRAction;
}

function btr(measures: BTRAction[], extra: Partial<BtrData> = {}): BtrData {
  return {
    progressIndicators: [],
    mitigationMeasures: measures,
    sectorEmissions: { bySector: [] },
    projections: [],
    technologySupport: [],
    capacityBuilding: [],
    ...extra,
  };
}

function target(id: string, doc: string): Target {
  return {
    id,
    text: `${id} full text`,
    sourceDocument: doc,
    sourceLabel: id,
    country: "Testland",
    isQuantitative: false,
    isTimeBound: false,
  };
}

function flag(
  a: string,
  b: string,
  manageability?: "manageable" | "fundamental",
  description = "",
): AlignmentResult {
  return {
    targetAId: a,
    targetBId: b,
    alignment: "flagged",
    description,
    ...(manageability ? { manageability } : {}),
  };
}

describe("computeActionPlanAlignment", () => {
  const data = btr([
    mit("Renewable energy"),
    mit("Livestock regulation"),
    adapt("ADP_1", "Irrigation systems", { responsibleOrgs: ["MET", "Water Agency"] }),
  ]);
  const targets = [
    target("T1", "NBSAP"),
    target("T2", "NBSAP"),
    target("T3", "NAP"),
    target("T4", "NAP"),
  ];

  it("counts only flagged pairs with one BTR side and a resolvable commitment", () => {
    const alignment = [
      flag("BTR_1", "T1"),
      flag("BTR_1", "T2"),
      flag("BTR_2", "T3"),
      flag("ADP_1", "T1"),
      flag("BTR_1", "BTR_2"), // action-vs-action -> excluded
      flag("T1", "T2"), // policy-vs-policy -> excluded
      flag("BTR_1", "T_missing"), // unresolvable -> excluded
      { targetAId: "BTR_1", targetBId: "T4", alignment: "high", description: "" },
    ] as AlignmentResult[];
    const r = computeActionPlanAlignment(alignment, data, targets, 5);
    expect(r.totalFlaggedPairs).toBe(4);
    expect(r.actionsWithPotentialMisalignment).toBe(3);
    expect(r.totalActions).toBe(3);
  });

  it("ranks actions by count desc, tie-broken by name", () => {
    const r = computeActionPlanAlignment(
      [flag("BTR_1", "T1"), flag("BTR_1", "T2"), flag("BTR_2", "T3"), flag("ADP_1", "T1")],
      data,
      targets,
      5,
    );
    expect(r.rankedActions.map((a) => a.actionId)).toEqual(["BTR_1", "ADP_1", "BTR_2"]);
    expect(r.rankedActions[0].actionName).toBe("Renewable energy");
    expect(r.rankedActions[1].actionType).toBe("adaptation");
  });

  it("maps BTR ids positionally over the mitigation subset", () => {
    const r = computeActionPlanAlignment([flag("BTR_2", "T3")], data, targets, 5);
    expect(r.rankedActions[0].actionName).toBe("Livestock regulation");
  });

  it("mirrors the pipeline's id rules: skip empty name/status, BTRA fallback, pre-ids honored", () => {
    const staged = btr([
      mit("Valid one"), // BTR_1
      mit("", {}), // empty name -> skipped, consumes NO seq (pipeline rule)
      mit("No status", { status: "" }), // skipped too
      mit("Valid two"), // BTR_2 (not BTR_4)
      { ...adapt("", "Fallback adaptation"), id: "" } as BTRAction, // empty id -> BTRA_1
      adapt("ADP_7_1", "Curated adaptation"), // pre-assigned id honored
    ]);
    const ids = [...buildActionMeta(staged).keys()];
    expect(ids).toEqual(["BTR_1", "BTR_2", "BTRA_1", "ADP_7_1"]);
    expect(buildActionMeta(staged).get("BTR_2")!.name).toBe("Valid two");
  });

  it("splits manageability into coordination-level and design-level counts", () => {
    const alignment = [
      flag("BTR_1", "T1", "manageable"),
      flag("BTR_1", "T2", "fundamental"),
      flag("BTR_2", "T3", "manageable"),
    ];
    const r = computeActionPlanAlignment(alignment, data, targets, 5);
    expect(r.manageablePairs).toBe(2);
    expect(r.fundamentalPairs).toBe(1);
    const a = r.rankedActions.find((x) => x.actionId === "BTR_1")!;
    expect(a.manageableCount).toBe(1);
    expect(a.fundamentalCount).toBe(1);
  });

  it("dedupes commitments, keeps worst manageability + rationale + text, design-level first", () => {
    const alignment = [
      flag("BTR_1", "T2", "manageable", "T2 reason"),
      flag("BTR_1", "T1", "manageable", "T1 reason"),
      flag("BTR_1", "T1", "fundamental", "T1 reason"), // same commitment, worse
    ];
    const a = computeActionPlanAlignment(alignment, data, targets, 5).rankedActions[0];
    expect(a.potentialMisalignmentCount).toBe(3);
    expect(a.commitments).toHaveLength(2);
    // T1 is design-level (fundamental) so it sorts first.
    expect(a.commitments[0].targetId).toBe("T1");
    expect(a.commitments[0].manageability).toBe("fundamental");
    expect(a.commitments[0].targetText).toBe("T1 full text");
    expect(a.commitments[0].rationale).toBe("T1 reason");
    expect(a.commitments[0].doc).toBe("NBSAP");
  });

  it("carries the institutions named on each action", () => {
    const a = computeActionPlanAlignment([flag("ADP_1", "T1")], data, targets, 5).rankedActions[0];
    expect(a.institutionLabels).toEqual(["MET", "Water Agency"]);
  });

  it("carries the country-reported status and counts under-way actions and distinct commitments", () => {
    const staged = btr([
      mit("Moving", { status: "Ongoing" }), // BTR_1
      mit("On paper", { status: "Adopted" }), // BTR_2
    ]);
    const r = computeActionPlanAlignment(
      [
        flag("BTR_1", "T1"),
        flag("BTR_1", "T2"),
        flag("BTR_2", "T1"), // same commitment as BTR_1 -> distinct count stays 2
      ],
      staged,
      targets,
      5,
    );
    expect(r.actionsWithPotentialMisalignment).toBe(2);
    expect(r.actionsUnderWayWithMisalignment).toBe(1);
    expect(r.flaggedCommitments).toBe(2);
    const moving = r.rankedActions.find((a) => a.actionId === "BTR_1")!;
    expect(moving.status).toBe("Ongoing");
    expect(moving.underWay).toBe(true);
  });

  it("computes concentration honestly (topShare + actionsToHalf) and respects the cap", () => {
    const alignment = [
      flag("BTR_1", "T1"),
      flag("BTR_1", "T2"),
      flag("BTR_2", "T3"),
      flag("ADP_1", "T1"),
    ];
    const capped = computeActionPlanAlignment(alignment, data, targets, 1);
    expect(capped.topShare).toBeCloseTo(0.5); // BTR_1 (2) of 4
    expect(capped.actionsToHalf).toBe(1);
  });

  it("is neutral and NaN-free with no flagged pairs", () => {
    const r = computeActionPlanAlignment(
      [{ targetAId: "BTR_1", targetBId: "T1", alignment: "high", description: "" }],
      data,
      targets,
      5,
    );
    expect(r.totalFlaggedPairs).toBe(0);
    expect(r.topShare).toBe(0);
    expect(r.actionsToHalf).toBe(0);
    expect(r.rankedActions).toEqual([]);
    expect(r.fundamentalPairs).toBe(0);
  });
});

describe("orgLabelsFor", () => {
  const m = (overrides: Partial<BTRAction>) => mit("x", overrides);

  it("returns a single clean institution for a single name", () => {
    expect(orgLabelsFor(m({ implementingEntity: "Ministry of Energy" }))).toEqual([
      "Ministry of Energy",
    ]);
  });

  it("splits multi-institution strings and strips footnote markers, sorted", () => {
    expect(
      orgLabelsFor(m({ implementingEntity: "MiAMBIENTE/MEF/CONEP/CNPML(111)" })),
    ).toEqual(["CNPML", "CONEP", "MEF", "MiAMBIENTE"]);
  });

  it("splits a spaced slash delimiter", () => {
    expect(
      orgLabelsFor(m({ implementingEntity: "Ministerio de Ambiente / Ministerio de Salud" })),
    ).toHaveLength(2);
  });

  it("does not split on commas inside a single name", () => {
    expect(
      orgLabelsFor(m({ implementingEntity: "Ministry of Food, Agriculture and Light Industry" })),
    ).toEqual(["Ministry of Food, Agriculture and Light Industry"]);
  });

  it("collapses case/whitespace duplicates, preferring the Title-cased form", () => {
    const labels = orgLabelsFor({
      ...mit("x"),
      actionType: "adaptation",
      responsibleOrgs: ["universities", "Universities", "  Universities "],
    } as BTRAction);
    expect(labels).toEqual(["Universities"]);
  });

  it("collapses an acronym and its full name named on the SAME action into one label", () => {
    // Source tables sometimes write "acronym / full name" in one cell; after
    // sourced expansion both tokens carry the same label and must dedupe.
    const labels = orgLabelsFor(
      m({ implementingEntity: "MET / Ministry of Environment and Climate Change" }),
      { met: "Ministry of Environment and Climate Change" },
    );
    expect(labels).toEqual(["Ministry of Environment and Climate Change"]);
  });
});

describe("normalizeOrg", () => {
  it("strips a trailing footnote marker and lowercases the dedupe key", () => {
    const inst = normalizeOrg("CNPML(111)", {});
    expect(inst.key).toBe("cnpml");
    expect(inst.label).toBe("CNPML");
    expect(inst.expanded).toBe(false);
  });

  it("collapses internal whitespace", () => {
    expect(normalizeOrg("Water   Agency", {}).label).toBe("Water Agency");
  });

  it("uses a sourced expansion when present, never invents one", () => {
    const mapped = normalizeOrg("MET", { met: "Ministry of Environment and Tourism" });
    expect(mapped.label).toBe("Ministry of Environment and Tourism");
    expect(mapped.expanded).toBe(true);
    expect(normalizeOrg("MET", {}).label).toBe("MET");
    expect(normalizeOrg("MET", {}).expanded).toBe(false);
  });
});

function high(a: string, b: string, description = ""): AlignmentResult {
  return { targetAId: a, targetBId: b, alignment: "high", description };
}

describe("computeImplementationCoverage", () => {
  const data = btr([
    mit("Renewable energy"), // BTR_1
    mit("Livestock regulation"), // BTR_2
    adapt("ADP_1", "Irrigation systems", { responsibleOrgs: ["MET", "Water Agency"] }),
  ]);
  const targets = [
    target("T1", "NBSAP"),
    target("T2", "NBSAP"),
    target("T3", "NBSAP"),
    target("T4", "NAP"),
  ];

  it("counts only HIGH pairs as coverage; medium/low/flagged leave a target uncovered", () => {
    const alignment = [
      high("BTR_1", "T1"),
      { targetAId: "BTR_1", targetBId: "T2", alignment: "medium", description: "" },
      { targetAId: "BTR_2", targetBId: "T3", alignment: "low", description: "" },
      flag("ADP_1", "T4"),
    ] as AlignmentResult[];
    const r = computeImplementationCoverage(alignment, data, targets);
    expect(r.reached).toBe(1);
    expect(r.total).toBe(4);
    expect(r.outsideReach).toBe(3);
  });

  it("counts distinct targets, not pairs: two high links on one target reach 1", () => {
    const r = computeImplementationCoverage(
      [high("BTR_1", "T1", "first"), high("ADP_1", "T1", "second")],
      data,
      targets,
    );
    expect(r.reached).toBe(1);
    const nbsap = r.byDocument.find((d) => d.doc === "NBSAP")!;
    expect(nbsap.links).toHaveLength(1);
  });

  it("the evidence link per target is the aligned action with the most advanced status", () => {
    const staged = btr([
      mit("Adopted action", { status: "Adopted" }), // BTR_1
      mit("Ongoing action", { status: "Ongoing" }), // BTR_2
    ]);
    const r = computeImplementationCoverage(
      [high("BTR_1", "T1", "adopted"), high("BTR_2", "T1", "ongoing")],
      staged,
      targets,
    );
    const link = r.byDocument[0].links[0];
    expect(link.actionName).toBe("Ongoing action");
    expect(link.actionStatus).toBe("Ongoing");
    expect(link.actionUnderWay).toBe(true);
    expect(r.reachedUnderWay).toBe(1);
  });

  it("counts reachedUnderWay only for ongoing/implemented best links", () => {
    const staged = btr([
      mit("On paper", { status: "Adopted" }), // BTR_1
      mit("Moving", { status: "Implemented" }), // BTR_2
    ]);
    const r = computeImplementationCoverage(
      [high("BTR_1", "T1"), high("BTR_2", "T2")],
      staged,
      targets,
    );
    expect(r.reached).toBe(2);
    expect(r.reachedUnderWay).toBe(1);
    // Under-way links sort before on-paper links within a doc row.
    const nbsap = r.byDocument.find((d) => d.doc === "NBSAP")!;
    expect(nbsap.links.map((l) => l.actionUnderWay)).toEqual([true, false]);
  });

  it("requires exactly one measure side: measure-x-measure and policy-x-policy are ignored", () => {
    const r = computeImplementationCoverage(
      [high("BTR_1", "ADP_1"), high("T1", "T2")],
      data,
      targets,
    );
    expect(r.reached).toBe(0);
  });

  it("ignores unknown measure ids", () => {
    const r = computeImplementationCoverage([high("BTR_99", "T1")], data, targets);
    expect(r.reached).toBe(0);
  });

  it("respects visibleTargets: a high link to a hidden target is excluded everywhere", () => {
    const visible = targets.filter((t) => t.sourceDocument !== "NAP");
    const r = computeImplementationCoverage(
      [high("BTR_1", "T4")], // T4 is in the hidden NAP
      data,
      visible,
    );
    expect(r.reached).toBe(0);
    expect(r.total).toBe(3);
    expect(r.byDocument.map((d) => d.doc)).toEqual(["NBSAP"]);
  });

  it("groups by document: links + uncovered partition the total, docs sorted by size", () => {
    const r = computeImplementationCoverage(
      [high("BTR_1", "T1", "why"), high("ADP_1", "T4")],
      data,
      targets,
    );
    expect(r.byDocument.map((d) => d.doc)).toEqual(["NBSAP", "NAP"]); // 3 > 1
    for (const d of r.byDocument) {
      expect(d.links.length + d.uncovered.length).toBe(d.total);
      expect(d.reached).toBe(d.links.length);
    }
    const nbsap = r.byDocument[0];
    expect(nbsap.reached).toBe(1);
    expect(nbsap.uncovered.map((u) => u.targetId)).toEqual(["T2", "T3"]);
    expect(nbsap.links[0].rationale).toBe("why");
  });

  it("carries action type and neutral institution labels on each link", () => {
    const r = computeImplementationCoverage(
      [high("ADP_1", "T1")],
      data,
      targets,
    );
    const link = r.byDocument[0].links[0];
    expect(link.actionType).toBe("adaptation");
    expect(link.institutionLabels).toEqual(["MET", "Water Agency"]);
  });

  it("tallies reported actions by type from the BTR itself", () => {
    const r = computeImplementationCoverage([], data, targets);
    expect(r.totalActions).toBe(3);
    expect(r.mitigationActions).toBe(2);
    expect(r.adaptationActions).toBe(1);
  });

  it("is neutral and NaN-free with empty alignment", () => {
    const r = computeImplementationCoverage([], data, targets);
    expect(r.reached).toBe(0);
    expect(r.outsideReach).toBe(4);
    expect(r.byDocument.every((d) => d.links.length === 0)).toBe(true);
  });

  it("attaches potentially misaligned actions to BOTH covered and uncovered targets", () => {
    const staged = btr([
      mit("Aligned action", { status: "Ongoing" }), // BTR_1
      mit("Pulling action", { status: "Implemented" }), // BTR_2
    ]);
    const r = computeImplementationCoverage(
      [
        high("BTR_1", "T1"),
        flag("BTR_2", "T1", "fundamental", "pulls against T1"),
        flag("BTR_2", "T2", "manageable", "pulls against T2"),
      ],
      staged,
      targets,
    );
    const nbsap = r.byDocument.find((d) => d.doc === "NBSAP")!;
    const covered = nbsap.links.find((l) => l.targetId === "T1")!;
    expect(covered.misalignments).toHaveLength(1);
    expect(covered.misalignments[0].actionName).toBe("Pulling action");
    expect(covered.misalignments[0].manageability).toBe("fundamental");
    expect(covered.misalignments[0].actionUnderWay).toBe(true);
    const uncovered = nbsap.uncovered.find((u) => u.targetId === "T2")!;
    expect(uncovered.misalignments).toHaveLength(1);
    expect(uncovered.misalignments[0].rationale).toBe("pulls against T2");
    expect(nbsap.flaggedTargets).toBe(2);
    expect(r.targetsWithMisalignment).toBe(2);
  });

  it("dedupes repeated flagged pairs per action and keeps the worst manageability", () => {
    const r = computeImplementationCoverage(
      [
        flag("BTR_1", "T1", "manageable", "first"),
        flag("BTR_1", "T1", "fundamental", "second"),
      ],
      data,
      targets,
    );
    const t1 = r.byDocument[0].uncovered.find((u) => u.targetId === "T1")!;
    expect(t1.misalignments).toHaveLength(1);
    expect(t1.misalignments[0].manageability).toBe("fundamental");
    expect(t1.misalignments[0].rationale).toBe("first"); // first rationale kept
  });

  it("sorts a target's misaligned actions moving-first, then design-level", () => {
    const staged = btr([
      mit("On paper design", { status: "Adopted" }), // BTR_1
      mit("Moving coordination", { status: "Ongoing" }), // BTR_2
    ]);
    const r = computeImplementationCoverage(
      [
        flag("BTR_1", "T1", "fundamental"),
        flag("BTR_2", "T1", "manageable"),
      ],
      staged,
      targets,
    );
    const t1 = r.byDocument[0].uncovered.find((u) => u.targetId === "T1")!;
    expect(t1.misalignments.map((m) => m.actionName)).toEqual([
      "Moving coordination", // under way wins over design-level on paper
      "On paper design",
    ]);
  });

  it("distinguishes 'no measure alignment computed' from 'computed, zero strong matches'", () => {
    // No measure pairs at all -> not computed.
    const none = computeImplementationCoverage([high("T1", "T2")], data, targets);
    expect(none.hasMeasureAlignment).toBe(false);
    // Measure pairs exist but none are high -> computed, a real zero.
    const zero = computeImplementationCoverage(
      [{ targetAId: "BTR_1", targetBId: "T1", alignment: "low", description: "" }],
      data,
      targets,
    );
    expect(zero.hasMeasureAlignment).toBe(true);
    expect(zero.reached).toBe(0);
  });
});

describe("computeDeliveryRoster", () => {
  const data = btr([
    mit("Wind farms", { implementingEntity: "Ministry of Energy", status: "Adopted" }), // BTR_1
    mit("Solar", { implementingEntity: "Ministry of Energy", status: "Implemented" }), // BTR_2
    adapt("ADP_1", "Pasture management", {
      responsibleOrgs: ["MOFALI", "Water Agency"],
      status: "Ongoing",
    }),
  ]);

  it("groups actions by named institution, most actions first", () => {
    const r = computeDeliveryRoster(data);
    expect(r.institutions.map((i) => i.label)).toEqual([
      "Ministry of Energy", // 2 actions
      "MOFALI",
      "Water Agency",
    ]);
    expect(r.institutions[0].actions.map((a) => a.id)).toEqual([
      "BTR_2", // Implemented sorts before Adopted (most advanced first)
      "BTR_1",
    ]);
  });

  it("counts a co-owned action once per named institution (involvement, not shares)", () => {
    const r = computeDeliveryRoster(data);
    const mofali = r.institutions.find((i) => i.label === "MOFALI")!;
    const water = r.institutions.find((i) => i.label === "Water Agency")!;
    expect(mofali.actions).toHaveLength(1);
    expect(water.actions).toHaveLength(1);
    expect(mofali.actions[0].id).toBe("ADP_1");
    expect(water.actions[0].id).toBe("ADP_1");
    // Involvement counts can sum above totalActions by design.
    const sum = r.institutions.reduce((s, i) => s + i.actions.length, 0);
    expect(sum).toBe(4);
    expect(r.totalActions).toBe(3);
  });

  it("collapses an acronym and its full name via the sourced map only", () => {
    const merged = btr([
      mit("A", { implementingEntity: "Ministry of Environment and Climate Change" }),
      adapt("ADP_1", "B", { responsibleOrgs: ["MET"] }),
    ]);
    const r = computeDeliveryRoster(merged, {
      met: "Ministry of Environment and Climate Change",
    });
    expect(r.institutions).toHaveLength(1);
    expect(r.institutions[0].actions).toHaveLength(2);
    // Without the sourced entry, the two render separately (never invented).
    const raw = computeDeliveryRoster(merged, {});
    expect(raw.institutions).toHaveLength(2);
  });

  it("counts actions naming no institution and keeps them out of the roster", () => {
    const sparse = btr([mit("A", { implementingEntity: "" })]);
    const r = computeDeliveryRoster(sparse);
    expect(r.institutions).toEqual([]);
    expect(r.actionsWithoutInstitution).toBe(1);
    expect(r.totalActions).toBe(1);
  });

  it("reports the status mix in lifecycle order (most advanced first) with raw strings", () => {
    const r = computeDeliveryRoster(data);
    expect(r.statusMix).toEqual([
      { status: "Implemented", count: 1 },
      { status: "Ongoing", count: 1 },
      { status: "Adopted", count: 1 },
    ]);
    expect(r.mitigationCount).toBe(2);
    expect(r.adaptationCount).toBe(1);
  });
});

describe("isUnderWay", () => {
  it("treats ongoing and implemented as under way, everything else not", () => {
    expect(isUnderWay("Ongoing")).toBe(true);
    expect(isUnderWay(" implemented ")).toBe(true);
    expect(isUnderWay("Adopted")).toBe(false);
    expect(isUnderWay("Planned")).toBe(false);
    expect(isUnderWay("Under revision")).toBe(false); // unknown -> conservative
  });
});

describe("nr7StatusByNbsapTarget", () => {
  it("maps NBT ids to NBSAP target ids with the self-assessed status", () => {
    const map = nr7StatusByNbsapTarget([
      { progressStatus: "limited", nbsapTargetId: "NBT_1" },
      { progressStatus: "on_track", nbsapTargetId: "NBT_12" },
      { progressStatus: "unknown" }, // no mapping -> dropped
    ]);
    expect(map.get("NBSAP_1")).toBe("limited");
    expect(map.get("NBSAP_12")).toBe("on_track");
    expect(map.size).toBe(2);
  });

  it("collapses two national targets on one NBSAP target to the least-progress status", () => {
    const map = nr7StatusByNbsapTarget([
      { progressStatus: "on_track", nbsapTargetId: "NBT_3" },
      { progressStatus: "limited", nbsapTargetId: "NBT_3" },
    ]);
    expect(map.get("NBSAP_3")).toBe("limited");
    // Order-independent: least progress wins either way.
    const reversed = nr7StatusByNbsapTarget([
      { progressStatus: "limited", nbsapTargetId: "NBT_3" },
      { progressStatus: "on_track", nbsapTargetId: "NBT_3" },
    ]);
    expect(reversed.get("NBSAP_3")).toBe("limited");
  });
});

describe("computeInstitutionFlow", () => {
  const data = btr([
    mit("Wind farms", { implementingEntity: "Ministry of Energy" }), // BTR_1
    mit("Solar", { implementingEntity: "Ministry of Energy" }), // BTR_2
    adapt("ADP_1", "Irrigation", {
      responsibleOrgs: ["MOFALI", "Water Agency"],
      status: "Ongoing",
    }),
  ]);
  const targets = [
    target("T1", "NBSAP"),
    target("T2", "NBSAP"),
    target("T3", "NAP"),
    target("T4", "NAP"),
  ];

  it("builds entity→document flows from HIGH links only; medium/low/flagged excluded", () => {
    const alignment = [
      high("BTR_1", "T1"),
      high("BTR_2", "T2"),
      high("ADP_1", "T3"),
      { targetAId: "BTR_1", targetBId: "T4", alignment: "medium", description: "" },
      flag("BTR_2", "T4"),
      high("BTR_1", "BTR_2"), // action-vs-action excluded
    ] as AlignmentResult[];
    const r = computeInstitutionFlow(alignment, data, targets);
    expect(r.hasMeasureAlignment).toBe(true);
    // Ministry of Energy supports T1+T2 in NBSAP (value 2); MOFALI & Water
    // Agency each support T3 in NAP (value 1).
    expect(r.institutions.map((i) => i.label)).toEqual([
      "Ministry of Energy",
      "MOFALI",
      "Water Agency",
    ]);
    expect(r.institutions[0].value).toBe(2);
    const moeNbsap = r.links.find(
      (l) => l.institutionKey === "ministry of energy" && l.doc === "NBSAP",
    )!;
    expect(moeNbsap.value).toBe(2);
    expect(moeNbsap.targets.map((t) => t.targetId)).toEqual(["T1", "T2"]);
    expect(r.totalSupportedTargets).toBe(3); // T1, T2, T3 distinct
  });

  it("flags targets supported by 2+ institutions as coordination points (involvement counting)", () => {
    const r = computeInstitutionFlow([high("ADP_1", "T3")], data, targets);
    expect(r.coordinationTargets).toBe(1); // T3: MOFALI + Water Agency
    // Involvement: T3 counts under each institution, so the doc total is 2.
    expect(r.documents.find((d) => d.doc === "NAP")!.value).toBe(2);
  });

  it("counts distinct targets per (entity, doc), not links", () => {
    const r = computeInstitutionFlow(
      [high("BTR_1", "T1"), high("BTR_2", "T1")], // both Ministry of Energy, one target
      data,
      targets,
    );
    const moe = r.institutions.find((i) => i.label === "Ministry of Energy")!;
    expect(moe.value).toBe(1);
    expect(r.links.find((l) => l.doc === "NBSAP")!.value).toBe(1);
  });

  it("picks the most advanced reported action as a target's representative", () => {
    const staged = btr([
      mit("Adopted action", {
        implementingEntity: "Ministry of Energy",
        status: "Adopted",
      }), // BTR_1
      mit("Ongoing action", {
        implementingEntity: "Ministry of Energy",
        status: "Ongoing",
      }), // BTR_2
    ]);
    const r = computeInstitutionFlow(
      [high("BTR_1", "T1"), high("BTR_2", "T1")],
      staged,
      targets,
    );
    expect(r.links.find((l) => l.doc === "NBSAP")!.targets[0].actionId).toBe(
      "BTR_2", // Ongoing is more advanced than Adopted
    );
  });

  it("caps institutions and bundles the rest into a neutral Other node", () => {
    const many = btr([
      mit("a", { implementingEntity: "Alpha" }), // BTR_1
      mit("b", { implementingEntity: "Beta" }), // BTR_2
      mit("c", { implementingEntity: "Gamma" }), // BTR_3
    ]);
    const ts = [
      target("T1", "NBSAP"),
      target("T2", "NBSAP"),
      target("T3", "NBSAP"),
      target("T4", "NBSAP"),
    ];
    const r = computeInstitutionFlow(
      [
        high("BTR_1", "T1"),
        high("BTR_1", "T2"), // Alpha supports 2 -> ranks first
        high("BTR_2", "T3"), // Beta 1
        high("BTR_3", "T4"), // Gamma 1 -> bundled (Beta wins the tie on label)
      ],
      many,
      ts,
      undefined,
      2,
    );
    expect(r.institutions.map((i) => i.label).slice(0, 2)).toEqual(["Alpha", "Beta"]);
    const other = r.institutions[2];
    expect(other.isOther).toBe(true);
    expect(other.value).toBe(1); // Gamma's single target
    expect(r.bundledInstitutions).toBe(1);
    expect(r.links.find((l) => l.institutionKey === other.key)!.value).toBe(1);
  });

  it("respects visibleTargets: a high link to a hidden target is excluded", () => {
    const visible = targets.filter((t) => t.sourceDocument !== "NAP");
    const r = computeInstitutionFlow([high("ADP_1", "T3")], data, visible);
    expect(r.institutions).toEqual([]);
    expect(r.totalSupportedTargets).toBe(0);
  });

  it("excludes actions naming no institution from the flow", () => {
    const sparse = btr([mit("Anon", { implementingEntity: "" })]); // BTR_1
    const r = computeInstitutionFlow([high("BTR_1", "T1")], sparse, targets);
    expect(r.hasMeasureAlignment).toBe(true);
    expect(r.institutions).toEqual([]);
    expect(r.totalSupportedTargets).toBe(0);
  });

  it("distinguishes 'no measure alignment' from 'computed, zero strong matches'", () => {
    const none = computeInstitutionFlow([high("T1", "T2")], data, targets);
    expect(none.hasMeasureAlignment).toBe(false);
    const zero = computeInstitutionFlow(
      [{ targetAId: "BTR_1", targetBId: "T1", alignment: "medium", description: "" }],
      data,
      targets,
    );
    expect(zero.hasMeasureAlignment).toBe(true);
    expect(zero.institutions).toEqual([]);
  });

  it("is neutral and NaN-free with empty alignment", () => {
    const r = computeInstitutionFlow([], data, targets);
    expect(r.institutions).toEqual([]);
    expect(r.documents).toEqual([]);
    expect(r.links).toEqual([]);
    expect(r.totalSupportedTargets).toBe(0);
    expect(r.coordinationTargets).toBe(0);
    expect(r.bundledInstitutions).toBe(0);
  });
});
