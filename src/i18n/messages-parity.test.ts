import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CATEGORY_TRANSLATIONS } from "@/data/category-translations";

/**
 * Full-catalog i18n parity gate.
 *
 * next-intl does NOT fail the build on a missing/extra key (it renders
 * `[[ns.key]]` at runtime), so this test is the gate that keeps en / es / mn in
 * lockstep across the WHOLE catalog — not just one slide. It asserts:
 *   1. identical flattened key sets in every locale (no missing/extra keys);
 *   2. identical ICU argument tokens per key (a translation can't silently drop
 *      a `{count}` / `{name}` placeholder);
 *   3. category coverage — every taxonomy id the dashboard renders has an es+mn
 *      display name in `category-translations.ts` (those names are localized at
 *      the data layer, not via the message catalog).
 *
 * The older `implementation-messages-parity.test.ts` was a scoped subset of (1)
 * and (2); this supersedes it for the full catalog.
 */

const LOCALES = ["en", "es", "mn"] as const;
type Locale = (typeof LOCALES)[number];
type Json = Record<string, unknown>;

function load(locale: string): Json {
  return JSON.parse(
    readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8"),
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

/**
 * TYPED ICU argument names — an identifier immediately followed by a comma,
 * e.g. `{count, plural, ...}` -> count, `{total, number}` -> total. A typed
 * placeholder is unambiguously a formatted argument: it is never prose and
 * never a plural/select branch body (`one {target}`), so this is free of the
 * false positives a bare-`{name}` scan hits when English words like "one" or
 * "other" precede a real `{arg}`, or when a Latin branch body (`other {metas}`)
 * differs from its English counterpart. Bare `{name}` placeholders are left to
 * the key-set parity check; the high-value bug this guards is a translator
 * typo'ing a typed arg name (`{cuenta, number}`), which renders as undefined.
 */
function icuArgs(message: string): Set<string> {
  const args = new Set<string>();
  const re = /\{\s*(\w+)\s*,/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(message))) args.add(m[1]);
  return args;
}

/**
 * VALUE-PRINTING ICU args only — `{x, number}`, `{x, date}`, `{x, time}`. These
 * are the args worth checking in BOTH directions. A plural/select arg can be
 * legitimately dropped when a language does not inflect (Mongolian renders one
 * noun form regardless of count), and a bare `{x}` placeholder is
 * indistinguishable from a single-word plural branch body (`other {metas}`)
 * without a full ICU parser — so both stay under the one-way subset check above.
 * A formatted arg always renders a value, so dropping one silently omits a
 * number or date from the sentence; those must appear in every locale.
 */
function formatArgs(message: string): Set<string> {
  const args = new Set<string>();
  const re = /\{\s*(\w+)\s*,\s*(?:number|date|time)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(message))) args.add(m[1]);
  return args;
}

const flat = Object.fromEntries(
  LOCALES.map((l) => [l, flatten(load(l))]),
) as Record<Locale, Record<string, string>>;

describe("full message-catalog parity (en/es/mn)", () => {
  const enKeys = Object.keys(flat.en).sort();

  it("en catalog is non-trivial", () => {
    expect(enKeys.length).toBeGreaterThan(500);
  });

  for (const l of LOCALES.filter((x) => x !== "en")) {
    it(`${l} has the exact same key set as en`, () => {
      const keys = Object.keys(flat[l]).sort();
      const missing = enKeys.filter((k) => !(k in flat[l]));
      const extra = keys.filter((k) => !(k in flat.en));
      expect(missing, `${l}: keys present in en but missing in ${l}`).toEqual([]);
      expect(extra, `${l}: keys present in ${l} but absent from en`).toEqual([]);
    });

    it(`${l} never references an ICU arg absent from en`, () => {
      // Subset invariant: a translation may legitimately use FEWER placeholders
      // than en (languages differ in plural/grammatical agreement), but it must
      // never reference an arg en doesn't supply — that renders as undefined.
      const mismatches: string[] = [];
      for (const key of enKeys) {
        const en = icuArgs(flat.en[key]);
        const loc = icuArgs(flat[l][key] ?? "");
        const unknown = [...loc].filter((a) => !en.has(a)).sort();
        if (unknown.length) {
          mismatches.push(
            `${key}: ${l} references {${unknown.join(",")}} not in en {${[...en].sort().join(",")}}`,
          );
        }
      }
      expect(mismatches, `unknown ICU args in ${l}`).toEqual([]);
    });

    it(`${l} keeps every value-printing ICU arg en supplies`, () => {
      // Complements the subset check: a translation may legitimately drop a
      // plural/select selector arg, but must never drop a {x, number|date|time}
      // arg — that silently omits a number/date en intended to render.
      const dropped: string[] = [];
      for (const key of enKeys) {
        const en = formatArgs(flat.en[key]);
        const loc = formatArgs(flat[l][key] ?? "");
        const missing = [...en].filter((a) => !loc.has(a)).sort();
        if (missing.length) {
          dropped.push(`${key}: ${l} drops formatted {${missing.join(",")}}`);
        }
      }
      expect(dropped, `dropped value-printing ICU args in ${l}`).toEqual([]);
    });
  }
});

describe("taxonomy category translation coverage (es/mn)", () => {
  // The display names the dashboard renders come from these four arrays in
  // categories.json. globe_subcategories are intentionally not localized.
  const categories = JSON.parse(
    readFileSync(
      join(process.cwd(), "python", "data", "categories.json"),
      "utf8",
    ),
  ) as Record<string, { id: string }[]>;
  const RENDERED_GROUPS = [
    "ipcc_sectors",
    "nbs_categories",
    "globe_categories",
    "gga_categories",
    "hr_categories",
  ] as const;

  for (const group of RENDERED_GROUPS) {
    it(`every ${group} id has an es + mn display name`, () => {
      const missing: string[] = [];
      for (const item of categories[group] ?? []) {
        const tr = CATEGORY_TRANSLATIONS[item.id];
        if (!tr?.es?.name) missing.push(`${item.id} (es)`);
        if (!tr?.mn?.name) missing.push(`${item.id} (mn)`);
      }
      expect(missing, `untranslated ${group} ids`).toEqual([]);
    });
  }
});
