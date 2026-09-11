import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildReviewGroups, rankPolicyLinkCandidates, REVIEW_CAP } from "./review-groups";
import { computeActionPlanAlignment } from "@/lib/implementation-coherence";
import { buildNr7Report } from "../../nr7-report";
import { FIXTURE_ALIGNMENT, FIXTURE_NR7, FIXTURE_TARGETS } from "../../nr7-report/test-fixture";
import type { AlignmentResult, BTRAction, BtrData, Nr7Data, Nr7PseudoTarget, Target } from "@/types";

const mit = (name: string, status = "Ongoing"): BTRAction => ({
  name, description: "", objectives: "", instrumentType: "", status, sector: "sector_energy", gasesAffected: "",
  startYear: "", implementingEntity: "Ministry of Energy", reductionEstimates: {}, actionType: "mitigation",
});
const btr = (measures: BTRAction[]): BtrData => ({
  progressIndicators: [], mitigationMeasures: measures, sectorEmissions: { bySector: [] }, projections: [], technologySupport: [], capacityBuilding: [],
});
const target = (id: string, doc: string): Target => ({ id, text: `${id} text`, sourceDocument: doc, sourceLabel: id, country: "T", isQuantitative: false, isTimeBound: false });
const flag = (a: string, b: string): AlignmentResult => ({ targetAId: a, targetBId: b, alignment: "flagged", description: "why", manageability: "manageable" });
const nr7Stand = (id: string): Nr7PseudoTarget => ({ id, text: "narrative", sourceDocument: "NR7", sourceLabel: "…", country: "T", isQuantitative: false, isTimeBound: false, actionType: "nr7", measureStatus: "limited" });

const policy = [target("NDC_1", "NDC"), target("NDC_2", "NDC"), target("NAP_1", "NAP"), target("NBSAP_1", "NBSAP")];
// Seven BTR actions with 7..1 flags, plus one NR7 action with 9 flags that must not enter the climate group.
const measures = Array.from({ length: 7 }, (_, i) => mit(`Action ${i + 1}`, i % 2 ? "Planned" : "Ongoing"));
const pairs: AlignmentResult[] = [];
measures.forEach((_, i) => { for (let k = 0; k < 7 - i; k += 1) pairs.push(flag(`BTR_${i + 1}`, policy[k % policy.length].id)); });
policy.forEach((p) => pairs.push(flag("NR7_1", p.id), flag("NR7_1", p.id)));
const summary = computeActionPlanAlignment(pairs, btr(measures), policy, 5, {}, [nr7Stand("NR7_1")]);
const nr7Report = buildNr7Report(FIXTURE_NR7, FIXTURE_ALIGNMENT, FIXTURE_TARGETS);

describe("buildReviewGroups", () => {
  it("climate group is BTR actions only, in the pipeline's order, with counts recomputed on that set", () => {
    const g = buildReviewGroups({ summary, nr7Report: null, btrActions: 7 });
    expect(g.climate!.items.map((a) => a.actionId)).toEqual(["BTR_1", "BTR_2", "BTR_3", "BTR_4", "BTR_5", "BTR_6", "BTR_7"]);
    expect(g.climate!.items.every((a) => a.actionType !== "nr7")).toBe(true);
    expect(summary.rankedActions[0].actionId).toBe("NR7_1"); // the NR7 action ranks first in the raw summary…
    expect(g.climate).toMatchObject({ total: 7, hidden: 2, totalActions: 7, maxCount: 7, underWay: 4 });
    expect(g.climate!.top).toHaveLength(REVIEW_CAP);
    expect(g.climate!.rest.map((a) => a.actionId)).toEqual(["BTR_6", "BTR_7"]);
    // …and its commitments are not counted: only the 4 policy targets the BTR actions touch.
    expect(g.climate!.flaggedCommitments).toBe(4);
    // 7+6+5 = 18 of 28 pairs: three actions cover half.
    expect(g.climate!.actionsToHalf).toBe(3);
    // Every action starts at NDC_1, so NDC leads; NAP and NBSAP tie and sort by id.
    expect(g.climate!.topDocs).toEqual(["NDC", "NAP", "NBSAP"]);
    expect(g.biodiversity).toBeNull();
  });

  it("biodiversity group puts card-eligible signals first so the top five never carry a held-back rule", () => {
    const g = buildReviewGroups({ summary: null, nr7Report, btrActions: 0 });
    expect(g.climate).toBeNull();
    expect(g.biodiversity!.items.map((i) => i.signal.rule)).toEqual(["ratingVsAnswers", "unknownWithData", "flatWhileOnTrack", "reachWhileNoChange", "sharedIndicatorDeclining"]);
    expect(g.biodiversity!.top.every((i) => i.signal.cardEligible)).toBe(true);
    // Four eligible signals: the top slice stays at four even though the cap
    // is five; the held-back one is hidden until "Show all".
    expect(g.biodiversity).toMatchObject({ total: 5, hidden: 1 });
    expect(g.biodiversity!.rest.map((i) => i.signal.rule)).toEqual(["sharedIndicatorDeclining"]);
    // With a cap of 3, the fourth eligible signal precedes the held-back one.
    const capped = buildReviewGroups({ summary: null, nr7Report, btrActions: 0, cap: 3 });
    expect(capped.biodiversity!.rest.map((i) => i.signal.rule)).toEqual(["reachWhileNoChange", "sharedIndicatorDeclining"]);
  });

  it("gives every cross-check the evidence its glyph prints", () => {
    const g = buildReviewGroups({ summary: null, nr7Report, btrActions: 0 });
    const by = (rule: string) => g.biodiversity!.items.find((i) => i.signal.rule === rule)!;
    expect(by("ratingVsAnswers").evidence).toMatchObject({ kind: "answers", notInPlace: 2, answered: 3 });
    expect(by("flatWhileOnTrack").evidence).toMatchObject({ kind: "series", direction: "flat", from: "2020", to: "2025", unit: "%", first: 20.77, last: 20.77 });
    expect((by("flatWhileOnTrack").evidence as { points: unknown[] }).points).toHaveLength(6);
    expect(by("unknownWithData").evidence).toMatchObject({ kind: "values", count: 2, from: "2010", to: "2024" });
    expect(by("reachWhileNoChange").evidence).toMatchObject({ kind: "reach", count: 3, max: 3 });
    expect(by("sharedIndicatorDeclining").evidence).toMatchObject({ kind: "series", direction: "down", first: 0.965, last: 0.953, unit: "index" });
  });

  it("ranks targets rated behind schedule by their HIGH links to other documents", () => {
    // NT01 limited (3 links, 2 docs), NT02 limited (1 link), NT03 unknown (never), NT04 no progress (3 links, 2 docs).
    const behind: Nr7Data = { ...FIXTURE_NR7, progressItems: FIXTURE_NR7.progressItems.map((i) => (i.targetId === "NT01" || i.targetId === "NT02" ? { ...i, progressStatus: "limited" as const } : i)) };
    const g = buildReviewGroups({ summary: null, nr7Report: buildNr7Report(behind, FIXTURE_ALIGNMENT, FIXTURE_TARGETS), btrActions: 0 });
    const pl = g.biodiversity!.policyLinks!;
    // NT01 and NT04 tie on links and documents (no flagged links either): the lower number leads.
    expect(pl.items.map((i) => i.row.targetId)).toEqual(["NT01", "NT04", "NT02"]);
    expect(pl).toMatchObject({ total: 3, hidden: 0, candidates: 3, maxCount: 3, topMin: 1 });
    expect(pl.items[0].evidence).toEqual({ kind: "policyLinks", count: 3, max: 3, docs: 2, flagged: 0, byDoc: [{ doc: "NDC", high: 2 }, { doc: "NAP", high: 1 }] });
    // A flagged link breaks the tie in favour of the more contested target.
    const contested = [...FIXTURE_ALIGNMENT, flag("NBSAP_4", "NDC_1")];
    const g2 = rankPolicyLinkCandidates(buildNr7Report(behind, contested, FIXTURE_TARGETS)!);
    expect(g2!.items.map((i) => i.row.targetId)).toEqual(["NT04", "NT01", "NT02"]);
    expect(g2!.items[0].evidence.flagged).toBe(1);
    // The cap folds the rest behind "Show all"; topMin follows the last shown row.
    const capped = rankPolicyLinkCandidates(buildNr7Report(behind, FIXTURE_ALIGNMENT, FIXTURE_TARGETS)!, 2);
    expect(capped).toMatchObject({ hidden: 1, topMin: 3 });
    expect(capped!.rest.map((i) => i.row.targetId)).toEqual(["NT02"]);
    // The stock fixture: only NT04 is behind schedule with a link.
    expect(g.biodiversity!.policyLinks!.items).toHaveLength(3);
    expect(buildReviewGroups({ summary: null, nr7Report, btrActions: 0 }).biodiversity!.policyLinks!.items.map((i) => i.row.targetId)).toEqual(["NT04"]);
  });

  it("has no policy-link group when nothing behind schedule is linked", () => {
    const onTrack: Nr7Data = { ...FIXTURE_NR7, progressItems: FIXTURE_NR7.progressItems.map((i) => ({ ...i, progressStatus: "on_track" as const })) };
    expect(buildReviewGroups({ summary: null, nr7Report: buildNr7Report(onTrack, FIXTURE_ALIGNMENT, FIXTURE_TARGETS), btrActions: 0 }).biodiversity!.policyLinks).toBeNull();
    // Behind schedule, but no policy alignment visible: null as well, so the slide falls back to the cross-checks.
    expect(buildReviewGroups({ summary: null, nr7Report: buildNr7Report(FIXTURE_NR7, [], FIXTURE_TARGETS), btrActions: 0 }).biodiversity!.policyLinks).toBeNull();
  });

  it("yields empty groups, not missing ones, when nothing is flagged", () => {
    const empty = computeActionPlanAlignment([], btr([mit("A")]), policy, 5, {}, []);
    const quiet: Nr7Data = { ...FIXTURE_NR7, questionnaire: { answers: [] }, indicators: [], progressItems: FIXTURE_NR7.progressItems.map((i) => ({ ...i, progressStatus: "limited" })) };
    const g = buildReviewGroups({ summary: empty, nr7Report: buildNr7Report(quiet, [], FIXTURE_TARGETS), btrActions: 1 });
    expect(g.climate).toMatchObject({ total: 0, actionsToHalf: 0, topDocs: [] });
    expect(g.biodiversity).toMatchObject({ total: 0, hidden: 0 });
    // A BTR summary with no BTR actions (NR7-only country) yields no climate group.
    expect(buildReviewGroups({ summary, nr7Report, btrActions: 0 }).climate).toBeNull();
  });
});

const OUT = resolve(process.cwd(), "python/output/mongolia/gpt-5-4");
const FILES = ["alignment.json", "measure_alignment.json", "nr7_alignment.json", "btr_data.json", "nr7_pseudo_targets.json"].map((f) => resolve(OUT, f));
const NR7 = resolve(process.cwd(), "python/data/external/nr7_mng.json");
const TARGETS = resolve(process.cwd(), "python/data/mongolia-targets.json");
const present = [...FILES, NR7, TARGETS].every((p) => existsSync(p));

describe.skipIf(!present)("buildReviewGroups on the Mongolia data", () => {
  const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
  const targets = (read(TARGETS) as Target[]).filter((t) => t.sourceDocument !== "BTR");
  const targetMap = new Map(targets.map((t) => [t.id, t]));
  const alignment = [...read(FILES[0]), ...read(FILES[1]), ...read(FILES[2])] as AlignmentResult[];
  const summary = computeActionPlanAlignment(alignment, read(FILES[3]) as BtrData, targets, 5, {}, read(FILES[4]) as Nr7PseudoTarget[]);
  const model = buildNr7Report(read(NR7) as Nr7Data, alignment.filter((p) => targetMap.has(p.targetAId) && targetMap.has(p.targetBId)), targetMap);
  const g = buildReviewGroups({ summary, nr7Report: model, btrActions: 15 });

  it("lists only BTR actions in the climate group, although the raw ranking is led by NR7 narratives", () => {
    expect(summary.rankedActions.some((a) => a.actionType === "nr7")).toBe(true);
    expect(g.climate!.items.every((a) => a.actionType !== "nr7" && !a.actionId.startsWith("NR7_"))).toBe(true);
    expect(g.climate!.total).toBeGreaterThan(0);
    expect(g.climate!.total).toBeLessThan(summary.actionsWithPotentialMisalignment);
    expect(g.climate!.flaggedCommitments).toBeLessThan(summary.flaggedCommitments);
  });

  it("leads the biodiversity group with the five reviewed rules and holds the funding decline back", () => {
    expect(g.biodiversity!.top.map((i) => i.signal.targetId)).toEqual(["NT12", "NT15", "NT05", "NT03", "NT07"]);
    expect(g.biodiversity!.rest.map((i) => i.signal.indicatorId)).toEqual(["D.2", "A.3"]);
    expect(g.biodiversity!.items.find((i) => i.signal.targetId === "NT12")!.evidence).toMatchObject({ kind: "answers", notInPlace: 4, answered: 5 });
    expect(g.biodiversity!.items.find((i) => i.signal.targetId === "NT07")!.evidence).toMatchObject({ kind: "reach", count: 38, max: 60 });
    expect(g.climate!.actionsToHalf).toBeGreaterThan(0);
    expect(g.climate!.topDocs.length).toBeGreaterThan(0);
  });

  it("leads the policy-link rows with agriculture, land restoration and spatial planning", () => {
    const pl = g.biodiversity!.policyLinks!;
    expect(pl.top.map((i) => i.row.targetId)).toEqual(["NT08", "NT02", "NT01"]);
    expect(pl).toMatchObject({ candidates: 13, total: 13, hidden: 10, maxCount: 51, topMin: 39 });
    expect(pl.items[0].evidence).toMatchObject({ count: 51, docs: 6, flagged: 11 });
    expect(pl.items[0].evidence.byDoc.slice(0, 3)).toEqual([{ doc: "NDC", high: 16 }, { doc: "NRVTS", high: 12 }, { doc: "SECTORAL", high: 9 }]);
  });
});
