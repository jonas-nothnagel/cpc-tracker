import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GLOSSARY_TERMS, isGlossaryTermId } from "@/data/glossary";

const LOCALES = ["en", "es", "mn"] as const;

function messages(locale: string): Record<string, never> {
  return JSON.parse(
    readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8"),
  );
}

/**
 * The registry (code) and the definitions (catalog) are separate on purpose, so
 * a term can be reworded without a deploy. The cost is that they can drift:
 * a term id with no catalog entry renders `[[glossary.x.term]]` at runtime
 * rather than failing the build. These are the tests that catch that.
 */
describe("glossary registry ↔ message catalog", () => {
  for (const locale of LOCALES) {
    it(`${locale} defines every registered term`, () => {
      const glossary = (messages(locale) as Record<string, unknown>).glossary as
        | Record<string, { term?: string; definition?: string }>
        | undefined;
      expect(glossary, `${locale}.json has no glossary block`).toBeDefined();
      for (const id of GLOSSARY_TERMS) {
        expect(glossary?.[id]?.term, `${locale} glossary.${id}.term`).toBeTruthy();
        expect(
          glossary?.[id]?.definition,
          `${locale} glossary.${id}.definition`,
        ).toBeTruthy();
      }
    });

    it(`${locale} defines no term the registry does not know`, () => {
      const glossary = (messages(locale) as Record<string, unknown>).glossary as
        | Record<string, unknown>
        | undefined;
      for (const id of Object.keys(glossary ?? {})) {
        expect(isGlossaryTermId(id), `${locale} glossary.${id} is unregistered`).toBe(
          true,
        );
      }
    });
  }
});

/**
 * Reading lines mark their vocabulary with rich-text tags (`<pair>…</pair>`).
 * A tag with no handler throws at render time, and a handler is generated per
 * registered term — so every tag used in a reading line must be a term id.
 */
describe("reading lines", () => {
  const TAG = /<([a-zA-Z][a-zA-Z0-9]*)>/g;

  for (const locale of LOCALES) {
    it(`${locale} only tags registered glossary terms`, () => {
      const briefing = (messages(locale) as Record<string, unknown>)
        .briefing as Record<string, { reading?: string }>;
      const offenders: string[] = [];
      for (const [section, block] of Object.entries(briefing)) {
        const reading = block?.reading;
        if (typeof reading !== "string") continue;
        for (const [, tag] of reading.matchAll(TAG)) {
          if (!isGlossaryTermId(tag)) offenders.push(`${section}: <${tag}>`);
        }
      }
      expect(offenders).toEqual([]);
    });

    it(`${locale} keeps reading lines short enough to actually be read`, () => {
      const briefing = (messages(locale) as Record<string, unknown>)
        .briefing as Record<string, { reading?: string }>;
      const tooLong: string[] = [];
      for (const [section, block] of Object.entries(briefing)) {
        const reading = block?.reading;
        if (typeof reading !== "string") continue;
        // Strip tags before counting: the markup is not words on the page.
        const words = reading.replace(/<\/?[a-zA-Z][a-zA-Z0-9]*>/g, "").split(/\s+/)
          .filter(Boolean).length;
        if (words > 25) tooLong.push(`${section}: ${words} words`);
      }
      expect(tooLong).toEqual([]);
    });
  }

  it("every section with a reading line has one in all three locales", () => {
    const perLocale = LOCALES.map((locale) => {
      const briefing = (messages(locale) as Record<string, unknown>)
        .briefing as Record<string, { reading?: string }>;
      return new Set(
        Object.entries(briefing)
          .filter(([, block]) => typeof block?.reading === "string")
          .map(([section]) => section),
      );
    });
    expect([...perLocale[1]].sort()).toEqual([...perLocale[0]].sort());
    expect([...perLocale[2]].sort()).toEqual([...perLocale[0]].sort());
    expect(perLocale[0].size).toBeGreaterThan(0);
  });
});
