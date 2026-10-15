import { describe, expect, it } from "vitest";
import { NO_AREA } from "./areas";
import { contractInFocus, emptyFocus, focusContext, hasFocus, targetInFocus, type Focus } from "./focus";
import { briefSide, contractsFixture } from "./test-fixture";

const file = contractsFixture();
const side = briefSide();
const ctx = focusContext({
  docOf: new Map(side.targets.map((t) => [t.id, t.doc])),
  categories: side.categories,
  primary: side.primary,
});
const byId = (id: string) => file.contracts.find((c) => c.id === id)!;
const focus = (over: Partial<Focus>): Focus => ({ ...emptyFocus("globe"), ...over });

describe("the focus", () => {
  it("is empty until a policy area, a document or a place is chosen", () => {
    expect(hasFocus(emptyFocus("globe"))).toBe(false);
    expect(hasFocus(focus({ doc: "A" }))).toBe(true);
  });

  it("keeps a contract by its own policy area under the lens in focus", () => {
    const f = focus({ area: "g_restoration" });
    expect(contractInFocus(byId("p2"), f, ctx, { area: true })).toBe(true);
    expect(contractInFocus(byId("p1"), f, ctx, { area: true })).toBe(false);
  });

  it("keeps a contract with no area of the lens under 'No policy area'", () => {
    const f = focus({ area: NO_AREA });
    expect(contractInFocus(byId("p5"), f, ctx, { area: true })).toBe(true);
    expect(contractInFocus(byId("p1"), f, ctx, { area: true })).toBe(false);
  });

  it("keeps a contract by a document whose target it strongly matches", () => {
    const f = focus({ doc: "C" });
    expect(contractInFocus(byId("p1"), f, ctx, { doc: true })).toBe(true);
    expect(contractInFocus(byId("p2"), f, ctx, { doc: true })).toBe(false);
  });

  it("keeps a contract by its one place, several or none counting as none", () => {
    expect(contractInFocus(byId("p1"), focus({ place: "MN-043" }), ctx, { place: true })).toBe(true);
    expect(contractInFocus(byId("p5"), focus({ place: "none" }), ctx, { place: true })).toBe(true);
    expect(contractInFocus(byId("p4"), focus({ place: "MN-043" }), ctx, { place: true })).toBe(false);
  });

  it("applies only the parts a view asks for", () => {
    const f = focus({ area: "g_restoration", doc: "C", place: "MN-1" });
    expect(contractInFocus(byId("p2"), f, ctx, { area: true })).toBe(true);
    expect(contractInFocus(byId("p2"), f, ctx, { area: true, doc: true })).toBe(false);
  });

  it("keeps a target by its document and its own policy area", () => {
    expect(targetInFocus("B1", focus({ doc: "B" }), ctx, { doc: true })).toBe(true);
    expect(targetInFocus("B1", focus({ area: "g_sustainable" }), ctx, { area: true })).toBe(false);
    expect(targetInFocus("C2", focus({ area: NO_AREA }), ctx, { area: true })).toBe(true);
  });
});
