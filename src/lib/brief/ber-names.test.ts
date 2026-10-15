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

  it("names every line of Mongolia's review in Mongolian, the machine translations marked", () => {
    const review = JSON.parse(readFileSync(join(process.cwd(), "python", "data", "mongolia-ber.json"), "utf8"));
    const names = loadBerNames("mongolia")!;
    const codes = (review.programs as { code: string }[]).map((p) => p.code);
    expect(codes.filter((code) => !names.names[code]?.mn || !names.names[code]?.mnDescription)).toEqual([]);
    // The review's sub-codes carry its own Mongolian; its programmes only English.
    expect(codes.filter((code) => names.names[code]?.mnMachine).every((code) => code.startsWith("714"))).toBe(true);
    expect(codes.filter((code) => !names.names[code]?.mnMachine).every((code) => /^8(17|22)/.test(code))).toBe(true);
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

  it("reads a line's Mongolian name and description, and whether they are a machine translation", () => {
    expect(
      parseBerNames({
        names: {
          "71401": { mn: "Хог хаягдлын менежмент", mnDescription: "Тайлбар.", mnMachine: true },
          "81708": { mn: "Ойжуулалт", mnDescription: "Тайлбар.", mnMachine: "yes" },
        },
      }),
    ).toEqual({
      names: {
        "71401": { mn: "Хог хаягдлын менежмент", mnDescription: "Тайлбар.", mnMachine: true },
        "81708": { mn: "Ойжуулалт", mnDescription: "Тайлбар." },
      },
    });
  });
});
