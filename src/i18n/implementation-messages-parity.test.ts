import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Parity guard for the Level 3 / Implementation slide copy. next-intl does NOT
 * fail the build on a missing key (it renders `[[ns.key]]` at runtime), so this
 * test is the gate: every new `briefing.implementation*` key must exist in
 * en + es + mn with the same ICU argument tokens. Scoped to the new branches
 * only, so it does not trip on any pre-existing drift elsewhere.
 */

const LOCALES = ["en", "es", "mn"] as const;
const BRANCHES = [
  "briefing.implementation",
  "briefing.implementationCenter",
  // The PairDrawer carries the Implementation drill-down's deep-dive copy
  // (e.g. the reported-action tag), so its branch is guarded here too.
  "briefing.drawer.pair",
] as const;
const SECTION_KEY = "briefing.sections.implementation";

type Json = Record<string, unknown>;

function load(locale: string): Json {
  return JSON.parse(
    readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8"),
  );
}

function getPath(obj: Json, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (cur, k) =>
        cur && typeof cur === "object"
          ? (cur as Json)[k]
          : undefined,
      obj,
    );
}

/** Flatten a nested object to `a.b.c` -> string-leaf paths. */
function flatten(obj: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Json)) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object") Object.assign(out, flatten(v, p));
      else out[p] = String(v);
    }
  }
  return out;
}

/** ICU argument names referenced in a message: `{count, plural, ...}` -> count,
 *  `{share}` -> share. The `#` inside plural sub-messages is not captured. */
function icuArgs(message: string): Set<string> {
  const args = new Set<string>();
  const re = /\{\s*(\w+)\s*[,}]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(message))) args.add(m[1]);
  return args;
}

const messages = Object.fromEntries(LOCALES.map((l) => [l, load(l)]));

describe("implementation message parity (en/es/mn)", () => {
  it("defines the section nav label in every locale", () => {
    for (const l of LOCALES) {
      expect(getPath(messages[l], SECTION_KEY), `${l} ${SECTION_KEY}`).toBeTypeOf(
        "string",
      );
    }
  });

  for (const branch of BRANCHES) {
    it(`has identical key sets across locales for ${branch}`, () => {
      const enKeys = Object.keys(flatten(getPath(messages.en, branch))).sort();
      expect(enKeys.length).toBeGreaterThan(0);
      for (const l of LOCALES) {
        const keys = Object.keys(flatten(getPath(messages[l], branch))).sort();
        expect(keys, `${l} keys under ${branch}`).toEqual(enKeys);
      }
    });

    it(`has matching ICU argument tokens across locales for ${branch}`, () => {
      const en = flatten(getPath(messages.en, branch));
      for (const l of LOCALES.filter((x) => x !== "en")) {
        const loc = flatten(getPath(messages[l], branch));
        for (const key of Object.keys(en)) {
          expect(
            [...icuArgs(loc[key] ?? "")].sort(),
            `${l} args for ${branch}.${key}`,
          ).toEqual([...icuArgs(en[key])].sort());
        }
      }
    });
  }
});
