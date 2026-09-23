import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import mn from "../../../messages/mn.json";

function strings(obj: unknown, path = ""): [string, string][] {
  if (typeof obj === "string") return [[path, obj]];
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    strings(v, path ? `${path}.${k}` : k),
  );
}

describe("brief copy", () => {
  it("speaks the project's alignment vocabulary in English", () => {
    // "Aligned" / "potential misalignment", never "reinforce", "flagged",
    // "tension" or "contradiction" (feedback_alignment_vocabulary).
    const banned = /reinforc|flagged|tension|contradict/i;
    expect(strings(en.brief).filter(([, v]) => banned.test(v))).toEqual([]);
  });

  it("calls the compared units targets: commitment is the team's finance layer", () => {
    // The team compares "targets" and counts "target pairs"; "Commitment"
    // names the public-finance layer of its framework (TAG 2, pitch deck).
    const tour = (en.briefing.tour as Record<string, unknown>).brief;
    expect(strings({ brief: en.brief, tour }).filter(([, v]) => /commitment/i.test(v))).toEqual([]);
    expect(strings(es.brief).filter(([, v]) => /compromiso/i.test(v))).toEqual([]);
  });

  it("keeps the walkthrough in the same vocabulary", () => {
    const tour = (en.briefing.tour as Record<string, unknown>).brief;
    expect(strings(tour).filter(([, v]) => /reinforc|flagged|tension|contradict|\byou\b/i.test(v))).toEqual([]);
  });

  it("describes themes as the pipeline builds them: pairs of documents, counted by their target pairs", () => {
    const steps = (en.briefing.tour as Record<string, { steps?: Record<string, { body: string }> }>).brief.steps!;
    expect(steps.themes.body).toMatch(/between the documents it covers/);
    expect(steps.themes.body).not.toMatch(/groups the rated target pairs/);
  });

  it("claims no expert confirmation the data does not record", () => {
    for (const catalog of [en, es, mn]) {
      expect(strings(catalog.brief).filter(([, v]) => /confirmed by|confirmado por|баталгаажуул/i.test(v))).toEqual([]);
    }
  });

  it("uses no em dashes in any language", () => {
    for (const catalog of [en, es, mn]) {
      expect(strings(catalog.brief).filter(([, v]) => v.includes("\u2014"))).toEqual([]);
    }
  });
});
