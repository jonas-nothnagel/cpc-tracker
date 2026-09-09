import { describe, expect, it } from "vitest";
import { nr7PairByTarget } from "./pair-by-target";
import { buildNr7Report } from "./nr7-self-report";
import { FIXTURE_ALIGNMENT, FIXTURE_NR7, FIXTURE_TARGETS } from "./test-fixture";
import type { AlignmentResult, Target } from "@/types";

const model = buildNr7Report(FIXTURE_NR7, FIXTURE_ALIGNMENT, FIXTURE_TARGETS)!;
const standIn = (id: string, parent: string): Target =>
  ({ id, text: "narrative", sourceDocument: "NR7", sourceLabel: "…", country: "T", isQuantitative: false, isTimeBound: false, actionType: "nr7", nr7ParentTargetId: parent }) as Target;
const pair = (a: string, b: string): AlignmentResult => ({ targetAId: a, targetBId: b, alignment: "low", description: "" });

describe("nr7PairByTarget", () => {
  it("maps a national target to the first of its NR7 stand-ins that has a scored pair with its NBSAP target", () => {
    const stands = new Map([["NR7_1", standIn("NR7_1", "NT02")], ["NR7_2", standIn("NR7_2", "NT02")], ["NR7_3", standIn("NR7_3", "NT03")]]);
    const map = nr7PairByTarget(model, FIXTURE_TARGETS, stands, [pair("NBSAP_2", "NR7_2"), pair("NR7_3", "NDC_1")]);
    expect([...map.entries()]).toEqual([["NT02", { actionId: "NR7_2", nbsapId: "NBSAP_2" }]]);
  });
  it("ignores stand-ins that are not NR7 actions, hidden NBSAP targets, and a null model", () => {
    const btr = { ...standIn("BTR_1", "NT02"), actionType: "mitigation" } as Target;
    expect(nr7PairByTarget(model, FIXTURE_TARGETS, new Map([["BTR_1", btr]]), [pair("NBSAP_2", "BTR_1")]).size).toBe(0);
    const hidden = new Map(FIXTURE_TARGETS); hidden.delete("NBSAP_2");
    expect(nr7PairByTarget(model, hidden, new Map([["NR7_1", standIn("NR7_1", "NT02")]]), [pair("NBSAP_2", "NR7_1")]).size).toBe(0);
    expect(nr7PairByTarget(null, FIXTURE_TARGETS, new Map(), []).size).toBe(0);
  });
});
