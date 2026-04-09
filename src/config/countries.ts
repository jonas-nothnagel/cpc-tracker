/**
 * Country registry — single source of truth for multi-country support.
 *
 * Used as:
 *   1. Security allowlist for API routes that accept a `?country=<id>` param.
 *      Callers MUST do `getCountry(lowercased)` FIRST and reject unknowns with
 *      400 before any filesystem access. `isValidCountryId` is defense-in-depth.
 *   2. Data source for landing page country CTAs and the upload wizard dropdown
 *      (`listVisibleCountries()`).
 *   3. Feature-presence flags so the dashboard can skip sections a country
 *      does not have data for (e.g. `has.btr.mitigation === false` hides BTR
 *      mitigation measures).
 *
 * Adding a new country: append an entry to `COUNTRIES`. Set `visible: false`
 * until data files are committed, then flip to `true` in a separate PR so the
 * reveal point is an explicit commit.
 */

/** Canonical country id — lowercased slug matching /^[a-z][a-z0-9-]{1,30}$/. */
export type CountryId = string;

export interface CountryEntry {
  /** Canonical id. Used in URLs (`?country=<id>`), file paths
   *  (`python/output/<id>/`), and registry lookups. Must match the regex. */
  id: CountryId;
  /** Optional alternate ids that resolve to this entry via `getCountry`.
   *  Each alias must also match the id regex and must not collide with another
   *  entry's canonical id or with another entry's alias. Validated at module load. */
  aliases?: CountryId[];
  /** Display name shown in the UI. */
  name: string;
  /** ISO-3166 alpha-3 code (lowercase), used to look up external data files
   *  like `python/data/external/nr7_<iso3>.json`. */
  iso3: string;
  /** Internal label for the country's onboarding stage. Not exposed in copy. */
  status: "pilot" | "demo";
  /** Whether the country appears on the landing page and upload dropdown. */
  visible: boolean;
  /** Feature-presence flags. When false, the corresponding dashboard section
   *  hides rather than renders empty. */
  has: {
    coherence: boolean;
    btr: {
      mitigation: boolean;
      adaptation: boolean;
    };
    nr7: boolean;
  };
}

/**
 * Id format regex. Narrow by design:
 *   - lowercase only (callers must lowercase the param first)
 *   - starts with a letter (rules out `-` and digits at position 0)
 *   - 2-31 characters total
 *   - only letters, digits, and `-`
 * This is the security regex applied before any filesystem path construction.
 */
const ID_REGEX = /^[a-z][a-z0-9-]{1,30}$/;

export function isValidCountryId(id: string): boolean {
  return ID_REGEX.test(id);
}

export const COUNTRIES: CountryEntry[] = [
  {
    id: "mongolia",
    name: "Mongolia",
    iso3: "mng",
    status: "pilot",
    visible: true,
    has: {
      coherence: true,
      btr: { mitigation: true, adaptation: true },
      nr7: true,
    },
  },
  {
    id: "panama",
    name: "Panama",
    iso3: "pan",
    status: "demo",
    visible: false, // PR1: registry entry exists for code path coverage; flipped to true in PR2 once data lands.
    has: {
      coherence: true,
      btr: { mitigation: false, adaptation: false },
      nr7: false,
    },
  },
];

/**
 * Look up a country by id. Checks canonical ids first, then aliases.
 *
 * Canonical always wins: if a future entry's canonical id ever matches an
 * existing entry's alias, the canonical entry resolves. This is a deliberate
 * precedence rule — aliases are lower-priority than canonicals.
 *
 * Inputs are lowercased before lookup so hand-typed uppercase URLs still
 * resolve. Callers that care about security (API routes) should also run
 * `isValidCountryId` first as defense-in-depth.
 */
export function getCountry(id: string): CountryEntry | undefined {
  if (!id) return undefined;
  const lower = id.toLowerCase();
  // Canonical pass.
  for (const c of COUNTRIES) {
    if (c.id === lower) return c;
  }
  // Alias pass.
  for (const c of COUNTRIES) {
    if (c.aliases?.includes(lower)) return c;
  }
  return undefined;
}

/** Return every registered country, including hidden ones. */
export function listCountries(): CountryEntry[] {
  return COUNTRIES;
}

/** Return only visible countries — what the landing page and upload dropdown show. */
export function listVisibleCountries(): CountryEntry[] {
  return COUNTRIES.filter((c) => c.visible);
}

// ─── Module-load validation ─────────────────────────────────────────────────
//
// Runs once when this file is first imported. Crashes the app at startup if
// any alias is malformed or collides — preferable to a silent path-traversal
// vector or an ambiguous lookup at runtime.

(function validateRegistry() {
  const seenCanonicals = new Set<string>();
  const seenAliases = new Set<string>();

  for (const c of COUNTRIES) {
    if (!isValidCountryId(c.id)) {
      throw new Error(`[countries] Invalid canonical id "${c.id}"`);
    }
    if (seenCanonicals.has(c.id)) {
      throw new Error(`[countries] Duplicate canonical id "${c.id}"`);
    }
    seenCanonicals.add(c.id);

    for (const alias of c.aliases ?? []) {
      if (!isValidCountryId(alias)) {
        throw new Error(`[countries] Invalid alias "${alias}" in ${c.id}`);
      }
      if (seenAliases.has(alias)) {
        throw new Error(`[countries] Duplicate alias "${alias}" across countries`);
      }
      seenAliases.add(alias);
    }
  }
})();
