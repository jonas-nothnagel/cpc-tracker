import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadBerNames, parseBerNames } from "./ber-names";

describe("budget lines' display names", () => {
  it("names every line of Panama's review, written out and translated", () => {
    const review = JSON.parse(readFileSync(join(process.cwd(), "python", "data", "panama-ber.json"), "utf8"));
    const names = loadBerNames("panama")!;
    const missing = (review.programs as { code: string }[]).flatMap((p) => [
      ...(names.names[p.code]?.es ? [] : [`${p.code}: es`]),
      ...(names.names[p.code]?.en ? [] : [`${p.code}: en`]),
    ]);
    expect(missing).toEqual([]);
  });

  it("has none for a country without a names file", () => {
    expect(loadBerNames("sri-lanka")).toBeNull();
  });

  it("keeps only names that are text", () => {
    expect(parseBerNames({ names: { A: { es: "Uno", en: "" }, B: { en: 3 }, C: null } })).toEqual({
      names: { A: { es: "Uno" } },
    });
    expect(parseBerNames({})).toBeNull();
  });
});
