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
