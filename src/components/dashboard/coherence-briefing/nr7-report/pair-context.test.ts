import { describe, expect, it } from "vitest";
import { buildNr7Report } from "./nr7-self-report";
import { nr7PairContext } from "./pair-context";
import { FIXTURE_ALIGNMENT, FIXTURE_NR7, FIXTURE_TARGETS } from "./test-fixture";
import type { AlignmentResult } from "@/types";

const flag = (a: string, b: string): AlignmentResult => ({ targetAId: a, targetBId: b, alignment: "flagged", description: "why", mechanism: "delivery_friction" });
// NDC_1 is flagged against NT04 and NT02; NAP_1 against NT04 only.
const model = buildNr7Report(FIXTURE_NR7, [...FIXTURE_ALIGNMENT, flag("NBSAP_4", "NDC_1"), flag("NBSAP_2", "NDC_1"), flag("NAP_1", "NBSAP_4")], FIXTURE_TARGETS)!;

describe("nr7PairContext", () => {
  it("names the national target, the counterpart side of the pair, and how many national targets the counterpart is flagged against", () => {
    const ctx = nr7PairContext(model, "NT04", "NBSAP_4", "NDC_1")!;
    expect(ctx.row.number).toBe("4");
    expect(ctx.counterpartId).toBe("NDC_1");
    expect(ctx.repeatsOn).toBe(2);
    // Either order of the pair; a counterpart on one target only does not repeat.
    expect(nr7PairContext(model, "NT04", "NAP_1", "NBSAP_4")).toMatchObject({ counterpartId: "NAP_1", repeatsOn: 1 });
  });

  it("gives nothing without the report, the target, its NBSAP match, or when the pair does not touch that match", () => {
    expect(nr7PairContext(null, "NT04", "NBSAP_4", "NDC_1")).toBeNull();
    expect(nr7PairContext(model, "NT99", "NBSAP_4", "NDC_1")).toBeNull();
    expect(nr7PairContext(model, "NT04", "NBSAP_1", "NDC_1")).toBeNull();
    const unmatched = buildNr7Report({ ...FIXTURE_NR7, progressItems: FIXTURE_NR7.progressItems.map((i) => ({ ...i, nbsapTargetId: null })) }, FIXTURE_ALIGNMENT, FIXTURE_TARGETS)!;
    expect(nr7PairContext(unmatched, "NT04", "NBSAP_4", "NDC_1")).toBeNull();
  });
});
