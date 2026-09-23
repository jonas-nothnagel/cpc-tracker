import { describe, expect, it } from "vitest";
import {
  NR7_RULES,
  answerMix,
  buildNr7Report,
  compareIndicatorIds,
  detectSignals,
  humaniseAnswerCode,
  pickCardSignals,
  policyLinksByNbsap,
  policyReachByNbsap,
  readSeries,
  type Nr7Signal,
  stripDeadlinePrefix,
} from "./nr7-self-report";
import type {
  AlignmentResult,
  Nr7Data,
  Nr7Indicator,
  Nr7ProgressItem,
  Nr7QuestionnaireAnswer,
  Target,
} from "@/types";

function item(targetId: string, status: Nr7ProgressItem["progressStatus"], nbsap: string | null): Nr7ProgressItem {
  return {
    targetId,
    targetText: `${targetId} text`,
    progressStatus: status,
    reportedActions: [],
    nbsapTargetId: nbsap,
  };
}

function answer(targetId: string, q: string, responseValue: Nr7QuestionnaireAnswer["responseValue"], response?: string): Nr7QuestionnaireAnswer {
  return {
    targetId,
    indicatorCode: "x",
    indicatorTitle: "x",
    questionNumber: q,
    questionTitle: `Question ${q}?`,
    response: response ?? (responseValue ?? "other"),
    responseValue,
  };
}

function indicator(id: string, targetIds: string[], series: { disaggregation?: string | null; unit?: string; values: (number | null)[]; fromYear?: number }[], extra: Partial<Nr7Indicator> = {}): Nr7Indicator {
  return {
    id,
    code: /^[A-D0-9]/.test(id) ? id : null,
    name: `Indicator ${id}`,
    title: `${id} Indicator ${id}`,
    indicatorType: "headline",
    targetIds,
    comments: null,
    series: series.map((s) => ({
      disaggregation: s.disaggregation ?? null,
      unit: s.unit ?? "%",
      points: s.values.map((v, i) => ({ year: (s.fromYear ?? 2020) + i, value: v, valueText: v === null ? "n/a" : null, footnote: null })),
    })),
    ...extra,
  };
}

function target(id: string, doc: string): Target {
  return { id, text: id, sourceDocument: doc, sourceLabel: id, country: "T", isQuantitative: false, isTimeBound: false };
}

const high = (a: string, b: string): AlignmentResult => ({ targetAId: a, targetBId: b, alignment: "high", description: "" });

const TARGETS = new Map([
  target("NBSAP_1", "NBSAP"), target("NBSAP_2", "NBSAP"), target("NBSAP_3", "NBSAP"), target("NBSAP_4", "NBSAP"),
  target("NDC_1", "NDC"), target("NDC_2", "NDC"), target("NAP_1", "NAP"),
].map((t) => [t.id, t]));

describe("answerMix", () => {
  it("counts the four scale answers and everything else as other", () => {
    expect(
      answerMix([
        answer("NT1", "1", "yes"), answer("NT1", "2", "partially"), answer("NT1", "3", "under_development"),
        answer("NT1", "4", "no"), answer("NT1", "5", null, "forTerrestrialPlanning"),
      ]),
    ).toEqual({ yes: 1, partially: 1, underDevelopment: 1, no: 1, other: 1, answered: 4 });
  });
});

describe("readSeries", () => {
  const ind = indicator("3.1", ["NT03"], []);
  it("reads flat within the tolerance, up and down beyond it", () => {
    expect(readSeries(ind, { disaggregation: null, unit: "%", points: [{ year: 2020, value: 20.77, valueText: null, footnote: null }, { year: 2025, value: 20.9, valueText: null, footnote: null }] }).direction).toBe("flat");
    expect(readSeries(ind, { disaggregation: null, unit: "%", points: [{ year: 2020, value: 15, valueText: null, footnote: null }, { year: 2025, value: 18.9, valueText: null, footnote: null }] }).direction).toBe("up");
    expect(readSeries(ind, { disaggregation: null, unit: "bn", points: [{ year: 2020, value: 355, valueText: null, footnote: null }, { year: 2023, value: 258, valueText: null, footnote: null }] }).direction).toBe("down");
  });
  it("ignores non-numeric points and reads one point as single, none as none", () => {
    const r = readSeries(ind, { disaggregation: "T", unit: "%", points: [{ year: 2020, value: null, valueText: "n/a", footnote: null }, { year: 2021, value: 3, valueText: null, footnote: null }] });
    expect(r).toMatchObject({ direction: "single", points: 1, first: 3, last: 3, label: "3.1 Indicator 3.1 (T)" });
    expect(readSeries(ind, { disaggregation: null, unit: null, points: [] }).direction).toBe("none");
  });
});

describe("policyReachByNbsap", () => {
  it("counts HIGH pairs with exactly one NBSAP side, both sides visible", () => {
    const reach = policyReachByNbsap(
      [
        high("NBSAP_1", "NDC_1"), high("NDC_2", "NBSAP_1"), high("NBSAP_1", "NBSAP_2"),
        { ...high("NBSAP_1", "NAP_1"), alignment: "medium" }, high("NBSAP_2", "HIDDEN_1"),
      ],
      TARGETS,
    );
    expect(reach.get("NBSAP_1")).toBe(2);
    expect(reach.get("NBSAP_2")).toBeUndefined();
  });
});

describe("policyLinksByNbsap", () => {
  const flagged = (a: string, b: string): AlignmentResult => ({ targetAId: a, targetBId: b, alignment: "flagged", description: "", mechanism: "delivery_friction", manageability: "manageable" });
  const pairs = [
    high("NBSAP_1", "NDC_1"), high("NDC_2", "NBSAP_1"), high("NBSAP_1", "NAP_1"), flagged("NAP_1", "NBSAP_1"),
    high("NBSAP_1", "NBSAP_2"), { ...high("NBSAP_1", "NDC_1"), alignment: "medium" as const },
    high("NBSAP_2", "HIDDEN_1"), flagged("NBSAP_3", "NDC_1"),
  ];

  it("keeps the counterpart, its document and the level, most frequent document first", () => {
    const links = policyLinksByNbsap(pairs, TARGETS);
    const one = links.get("NBSAP_1")!;
    expect(one.high.map((l) => [l.targetId, l.doc, l.level])).toEqual([["NDC_1", "NDC", "high"], ["NDC_2", "NDC", "high"], ["NAP_1", "NAP", "high"]]);
    expect(one.flagged).toEqual([{ targetId: "NAP_1", doc: "NAP", label: "NAP_1", text: "NAP_1", level: "flagged", mechanism: "delivery_friction" }]);
    expect(one.byDoc).toEqual([{ doc: "NDC", high: 2, flagged: 0 }, { doc: "NAP", high: 1, flagged: 1 }]);
    expect(one.docs).toBe(2);
    // NBSAP-to-NBSAP, medium and hidden counterparts never count.
    expect(links.get("NBSAP_2")).toBeUndefined();
    // A target with flagged links only has no HIGH document.
    expect(links.get("NBSAP_3")).toMatchObject({ high: [], docs: 0, byDoc: [{ doc: "NDC", high: 0, flagged: 1 }] });
  });

  it("is the reach's source of truth and can count from another restated document", () => {
    const links = policyLinksByNbsap(pairs, TARGETS);
    const reach = policyReachByNbsap(pairs, TARGETS);
    for (const [id, l] of links) expect(reach.get(id) ?? 0).toBe(l.high.length);
    // Counted from the NDC side: NDC_1 has NBSAP_1 (high) and NBSAP_3 (flagged).
    const fromNdc = policyLinksByNbsap(pairs, TARGETS, "NDC");
    expect(fromNdc.get("NDC_1")).toMatchObject({ high: [{ targetId: "NBSAP_1" }], flagged: [{ targetId: "NBSAP_3" }] });
    expect(fromNdc.get("NBSAP_1")).toBeUndefined();
  });
});

describe("stripDeadlinePrefix", () => {
  it("drops a leading deadline in the three forms the reports use and reads on as a sentence", () => {
    expect(stripDeadlinePrefix("By 2030, reduce ecosystem degradation.")).toBe("Reduce ecosystem degradation.");
    expect(stripDeadlinePrefix("By  2030 Reduce the risk of extinction")).toBe("Reduce the risk of extinction");
    expect(stripDeadlinePrefix("Para 2030, restaurar el 30%.")).toBe("Restaurar el 30%.");
    expect(stripDeadlinePrefix("Hasta 2030 conservar áreas.")).toBe("Conservar áreas.");
  });

  it("leaves any other opening alone and is idempotent", () => {
    expect(stripDeadlinePrefix("Substantially and progressively reduce pollution")).toBe("Substantially and progressively reduce pollution");
    expect(stripDeadlinePrefix("By 2030")).toBe("By 2030");
    expect(stripDeadlinePrefix(stripDeadlinePrefix("By 2030, reduce pollution."))).toBe("Reduce pollution.");
  });
});

describe("humaniseAnswerCode", () => {
  it("splits API codes into words and semicolon lists into commas, keeps free text", () => {
    expect(humaniseAnswerCode("forTerrestrialPlanning")).toBe("for terrestrial planning");
    expect(humaniseAnswerCode("mitigation; adaptation; disasterRiskReduction")).toBe("mitigation, adaptation, disaster risk reduction");
    expect(humaniseAnswerCode("Mongolia has established partnerships.")).toBe("Mongolia has established partnerships.");
  });
});

describe("compareIndicatorIds", () => {
  it("orders goal indicators, then target indicators by number, then uncoded", () => {
    const ids = ["10.2", "ecosystem-category", "A.CT.10", "3.1", "D.2", "1.1", "A.3"];
    expect([...ids].sort(compareIndicatorIds)).toEqual(["A.3", "A.CT.10", "D.2", "1.1", "3.1", "10.2", "ecosystem-category"]);
  });
});

describe("detectSignals and the report model", () => {
  const data: Nr7Data = {
    country: "Testland",
    reportingPeriod: "2026",
    source: { name: "ORT", url: "x", fetchedAt: "2026-09-09T00:00:00Z", publishedOn: "2026-02-28" },
    progressItems: [
      item("NT01", "on_track", "NBSAP_1"),   // ratingVsAnswers: 2 of 3 not in place
      item("NT02", "on_track", "NBSAP_2"),   // flatWhileOnTrack via 2.1
      item("NT03", "unknown", "NBT_3"),      // unknownWithSeries via 6.1; legacy id rewritten
      item("NT04", "no_progress", "NBSAP_4"), // reachWhileNoChange (reach 3 = top quartile)
      item("NT05", "no_progress", null),      // no NBSAP match: never reachWhileNoChange
    ],
    questionnaire: {
      answers: [
        answer("NT01", "1.1", "under_development"), answer("NT01", "1.2", "no"), answer("NT01", "1.3", "yes"),
        answer("NT01", "1.4", null, "forTerrestrialPlanning"),
        answer("NT02", "2.1", "under_development"), answer("NT02", "2.2", "under_development"), // only 2 scale answers: below MIN_ANSWERS
      ],
    },
    indicators: [
      indicator("2.1", ["NT02"], [{ disaggregation: "Terrestrial", values: [20.77, 20.77, 20.77, 20.77] }, { disaggregation: "OECM", values: [15, 17, 18.9] }]),
      indicator("6.1", ["NT03"], [{ values: [27, 60, 154], unit: "species" }]),
      indicator("D.2", ["NT01", "NT02", "NT03", "NT04"], [{ values: [355, 300, 258], unit: "bn" }]),
      indicator("A.3", ["NT01", "NT02", "NT03", "NT04"], [{ values: [0.96, 0.95, 0.96] }]), // shared but not falling
      indicator("18.2", [], [], { comments: "Screening under way." }),
      indicator("wwf", ["NT01"], [{ disaggregation: "Steppe", values: [1], fromYear: 2020 }], { code: null, indicatorType: "national" }),
    ],
  };
  const alignment = [high("NBSAP_4", "NDC_1"), high("NBSAP_4", "NDC_2"), high("NBSAP_4", "NAP_1"), high("NBSAP_1", "NDC_1"), high("NBSAP_2", "NDC_1")];

  it("fires each rule on the right target and nowhere else", () => {
    const model = buildNr7Report(data, alignment, TARGETS)!;
    const byRule = (rule: Nr7Signal["rule"]) => model.signals.filter((s) => s.rule === rule);
    expect(byRule("ratingVsAnswers").map((s) => s.targetId)).toEqual(["NT01"]);
    expect(byRule("ratingVsAnswers")[0].params).toMatchObject({ id: "NT01", n: "1", notInPlace: 2, answered: 3 });
    expect(byRule("flatWhileOnTrack").map((s) => [s.targetId, s.indicatorId])).toEqual([["NT02", "2.1"]]);
    expect(byRule("flatWhileOnTrack")[0].params).toMatchObject({ indicator: "2.1 Indicator 2.1 (Terrestrial)", value: "20.77", unit: "%", from: "2020", to: "2023" });
    expect(byRule("unknownWithData").map((s) => s.targetId)).toEqual(["NT03"]);
    expect(byRule("unknownWithData")[0].params).toMatchObject({ indicator: "6.1 Indicator 6.1", points: 3, from: "2020", to: "2022" });
    expect(byRule("reachWhileNoChange").map((s) => s.targetId)).toEqual(["NT04"]);
    // With no policy alignment visible every reach is zero, and zero says nothing.
    expect(buildNr7Report(data, [], TARGETS)!.signals.some((s) => s.rule === "reachWhileNoChange")).toBe(false);
    expect(byRule("sharedIndicatorDeclining").map((s) => s.indicatorId)).toEqual(["D.2"]);
    expect(byRule("sharedIndicatorDeclining")[0]).toMatchObject({ cardEligible: false, params: { targets: 4, onTrack: 2, first: "355", last: "258" } });
  });

  it("keeps the shared funding rule off the card and takes one signal per rule first", () => {
    const model = buildNr7Report(data, alignment, TARGETS)!;
    expect(model.cardSignals.map((s) => s.rule)).toEqual(["ratingVsAnswers", "unknownWithData", "flatWhileOnTrack"]);
    expect(model.cardSignals.every((s) => s.rule !== "sharedIndicatorDeclining")).toBe(true);
    // Fill pass: with a cap of 5 the reach signal joins; the drawer-only rule never does.
    expect(pickCardSignals(model.signals, 5).map((s) => s.rule)).toEqual(["ratingVsAnswers", "unknownWithData", "flatWhileOnTrack", "reachWhileNoChange"]);
    // Two signals of one rule: the second only enters in the fill pass.
    const twice: Nr7Signal[] = [
      { rule: "ratingVsAnswers", targetId: "A", cardEligible: true, params: {}, strength: 0.9 },
      { rule: "ratingVsAnswers", targetId: "B", cardEligible: true, params: {}, strength: 0.6 },
      { rule: "flatWhileOnTrack", targetId: "C", cardEligible: true, params: {}, strength: 3 },
    ];
    expect(pickCardSignals(twice, 3).map((s) => s.targetId)).toEqual(["A", "C", "B"]);
  });

  it("builds rows with answers, indicator splits, reach and legacy id rewriting", () => {
    const model = buildNr7Report(data, alignment, TARGETS)!;
    const nt01 = model.targets[0];
    expect(nt01).toMatchObject({ targetId: "NT01", number: "1", nbsapTargetId: "NBSAP_1", nbsapNumber: "1", policyReach: 1 });
    expect(nt01.answers).toEqual({ yes: 1, partially: 0, underDevelopment: 1, no: 1, other: 1, answered: 3 });
    expect(nt01.notInPlace.map((a) => a.questionNumber)).toEqual(["1.1", "1.2"]);
    expect(nt01.otherAnswers.map((a) => a.response)).toEqual(["forTerrestrialPlanning"]);
    expect(nt01.specificIndicatorIds).toEqual(["wwf"]);
    expect(nt01.sharedIndicatorIds).toEqual(["A.3", "D.2"]);
    const nt03 = model.targets[2];
    expect(nt03.nbsapTargetId).toBe("NBSAP_3"); // "NBT_3" rewritten
    expect(model.targets[4].policyReach).toBeNull();
    expect(model.targets[4].policyLinks).toBeNull();
    // Reach is the HIGH link count; a matched target with no pairs carries empty links, not null.
    expect(model.targets[3].policyLinks).toMatchObject({ docs: 2, byDoc: [{ doc: "NDC", high: 2, flagged: 0 }, { doc: "NAP", high: 1, flagged: 0 }] });
    expect(model.targets.every((t) => t.policyReach === (t.policyLinks?.high.length ?? null))).toBe(true);
    expect(nt03.policyLinks).toEqual({ high: [], flagged: [], byDoc: [], docs: 0 });
    // A file without the GBF field yields an empty list, never undefined.
    expect(nt01.gbfTargets).toEqual([]);
  });

  it("groups indicators and counts the totals", () => {
    const model = buildNr7Report(data, alignment, TARGETS)!;
    expect(model.indicators.map((i) => [i.id, i.group])).toEqual([
      ["A.3", "headline"], ["D.2", "headline"], ["2.1", "headline"], ["6.1", "headline"], ["18.2", "noValues"], ["wwf", "other"],
    ]);
    expect(model.totals).toEqual({
      targets: 5,
      byStatus: { on_track: 2, limited: 0, no_progress: 2, unknown: 1 },
      answers: 6,
      targetsWithAnswers: 2,
      indicators: 6,
      indicatorsWithValues: 5,
      indicatorsWithNote: 1,
    });
    expect(model.publishedOn).toBe("2026-02-28");
  });

  it("is null without data and tolerates a file with no questionnaire or indicators", () => {
    expect(buildNr7Report(null, [], TARGETS)).toBeNull();
    expect(buildNr7Report({ ...data, progressItems: [] }, [], TARGETS)).toBeNull();
    const bare = buildNr7Report({ country: "T", reportingPeriod: "2026", progressItems: [item("NT01", "on_track", null)] }, [], TARGETS)!;
    expect(bare.totals).toMatchObject({ answers: 0, indicators: 0 });
    expect(bare.signals).toEqual([]);
    expect(detectSignals(bare.targets, bare.indicators)).toEqual([]);
  });

  it("exposes its thresholds", () => {
    expect(NR7_RULES.CARD_CAP).toBe(3);
    expect(NR7_RULES.SHARED_INDICATOR_MIN_TARGETS).toBeGreaterThan(NR7_RULES.SPECIFIC_MAX_TARGETS);
  });
});
