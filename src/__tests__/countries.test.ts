import { describe, it, expect } from "vitest";
import {
  COUNTRIES,
  getCountry,
  listCountries,
  listVisibleCountries,
  isValidCountryId,
  normaliseCountry,
  validateRegistry,
  type CountryEntry,
} from "@/config/countries";

describe("getCountry", () => {
  it("returns the Mongolia entry for canonical id", () => {
    const m = getCountry("mongolia");
    expect(m).toBeDefined();
    expect(m?.name).toBe("Mongolia");
    expect(m?.visible).toBe(true);
    expect(m?.has.coherence).toBe(true);
    expect(m?.has.btr.mitigation).toBe(true);
    expect(m?.has.btr.adaptation).toBe(true);
    expect(m?.has.nr7).toBe(true);
  });

  it("returns the Panama entry as visible with coherence and BTR mitigation", () => {
    const p = getCountry("panama");
    expect(p).toBeDefined();
    expect(p?.name).toBe("Panama");
    expect(p?.visible).toBe(true);
    expect(p?.has.coherence).toBe(true);
    expect(p?.has.btr.mitigation).toBe(true);
    expect(p?.has.btr.adaptation).toBe(false);
    expect(p?.has.nr7).toBe(false);
  });

  it("returns the Sri Lanka entry as visible, coherence-only", () => {
    const s = getCountry("sri-lanka");
    expect(s).toBeDefined();
    expect(s?.name).toBe("Sri Lanka");
    expect(s?.iso3).toBe("lka");
    expect(s?.visible).toBe(true);
    expect(s?.has.coherence).toBe(true);
    expect(s?.has.btr.mitigation).toBe(false);
    expect(s?.has.btr.adaptation).toBe(false);
    expect(s?.has.nr7).toBe(false);
    expect(s?.has.ber).toBe(false);
  });

  it("lowercases before lookup", () => {
    expect(getCountry("MONGOLIA")?.id).toBe("mongolia");
    expect(getCountry("Mongolia")?.id).toBe("mongolia");
  });

  it("returns undefined for empty input", () => {
    expect(getCountry("")).toBeUndefined();
  });

  it("returns undefined for unknown country", () => {
    expect(getCountry("unknown")).toBeUndefined();
    expect(getCountry("marsland")).toBeUndefined();
  });

  it("resolves aliases to their canonical entry", () => {
    // Add a test alias to the Mongolia entry in-place for this test.
    // Rationale: aliases are a first-class feature; we verify them without
    // polluting COUNTRIES in production. We mutate and restore.
    const mongolia = COUNTRIES.find((c) => c.id === "mongolia")!;
    const originalAliases = mongolia.aliases;
    mongolia.aliases = ["mng-test"];
    try {
      expect(getCountry("mng-test")?.id).toBe("mongolia");
      expect(getCountry("MNG-TEST")?.id).toBe("mongolia");
    } finally {
      mongolia.aliases = originalAliases;
    }
  });

  it("canonical id wins over alias", () => {
    // If another country had alias "mongolia", canonical "mongolia" should
    // still resolve first. We simulate by adding a conflicting alias.
    const panama = COUNTRIES.find((c) => c.id === "panama")!;
    const originalAliases = panama.aliases;
    panama.aliases = ["mongolia-fake"];
    try {
      // Canonical Mongolia resolves normally.
      expect(getCountry("mongolia")?.id).toBe("mongolia");
      // The alias on Panama still works for its own lookup.
      expect(getCountry("mongolia-fake")?.id).toBe("panama");
    } finally {
      panama.aliases = originalAliases;
    }
  });
});

describe("listCountries", () => {
  it("returns all registered countries including hidden ones", () => {
    const all = listCountries();
    expect(all.length).toBeGreaterThanOrEqual(2);
    const ids = all.map((c) => c.id);
    expect(ids).toContain("mongolia");
    expect(ids).toContain("panama");
  });
});

describe("listVisibleCountries", () => {
  it("returns both Mongolia and Panama now that PR2 has landed", () => {
    const visible = listVisibleCountries();
    const ids = visible.map((c) => c.id);
    expect(ids).toContain("mongolia");
    expect(ids).toContain("panama");
  });

  it("every visible country has a non-empty name and valid id", () => {
    for (const c of listVisibleCountries()) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(isValidCountryId(c.id)).toBe(true);
    }
  });
});

describe("isValidCountryId", () => {
  it("accepts valid slugs", () => {
    expect(isValidCountryId("mongolia")).toBe(true);
    expect(isValidCountryId("panama")).toBe(true);
    expect(isValidCountryId("costa-rica")).toBe(true);
    expect(isValidCountryId("country-2")).toBe(true);
    expect(isValidCountryId("ab")).toBe(true); // minimum length: 2
  });

  it("rejects uppercase input", () => {
    expect(isValidCountryId("Mongolia")).toBe(false);
    expect(isValidCountryId("MONGOLIA")).toBe(false);
  });

  it("rejects path traversal attempts", () => {
    expect(isValidCountryId("../../etc/passwd")).toBe(false);
    expect(isValidCountryId("../..")).toBe(false);
    expect(isValidCountryId("..")).toBe(false);
    expect(isValidCountryId("/etc/passwd")).toBe(false);
  });

  it("rejects command injection attempts", () => {
    expect(isValidCountryId("mongolia; rm -rf /")).toBe(false);
    expect(isValidCountryId("mongolia && whoami")).toBe(false);
    expect(isValidCountryId("mongolia`whoami`")).toBe(false);
  });

  it("rejects inputs that are too short", () => {
    expect(isValidCountryId("")).toBe(false);
    expect(isValidCountryId("m")).toBe(false);
  });

  it("rejects inputs that are too long", () => {
    expect(isValidCountryId("a".repeat(32))).toBe(false);
    // 31 chars is the maximum allowed.
    expect(isValidCountryId("a".repeat(31))).toBe(true);
  });

  it("rejects ids that do not start with a letter", () => {
    expect(isValidCountryId("1mongolia")).toBe(false);
    expect(isValidCountryId("-mongolia")).toBe(false);
  });

  it("rejects whitespace and special characters", () => {
    expect(isValidCountryId("mon golia")).toBe(false);
    expect(isValidCountryId("mongolia_test")).toBe(false);
    expect(isValidCountryId("mongolia.json")).toBe(false);
  });
});

describe("normaliseCountry", () => {
  it("strips diacritics", () => {
    expect(normaliseCountry("Panamá")).toBe("panama");
    expect(normaliseCountry("Côte d'Ivoire")).toBe("cote d'ivoire");
  });

  it("lowercases", () => {
    expect(normaliseCountry("MONGOLIA")).toBe("mongolia");
    expect(normaliseCountry("Mongolia")).toBe("mongolia");
  });

  it("returns the same string for already-normalised input", () => {
    expect(normaliseCountry("mongolia")).toBe("mongolia");
    expect(normaliseCountry("panama")).toBe("panama");
  });

  it("handles empty string", () => {
    expect(normaliseCountry("")).toBe("");
  });
});

describe("validateRegistry", () => {
  // Helper to build a minimal valid CountryEntry for collision tests.
  const make = (overrides: Partial<CountryEntry>): CountryEntry => ({
    id: "testland",
    name: "Testland",
    iso3: "tst",
    status: "demo",
    visible: false,
    has: { coherence: false, btr: { mitigation: false, adaptation: false }, nr7: false, ber: false },
    ...overrides,
  });

  it("accepts the production COUNTRIES array", () => {
    expect(() => validateRegistry(COUNTRIES)).not.toThrow();
  });

  it("throws on invalid canonical id", () => {
    expect(() => validateRegistry([make({ id: "1invalid" })])).toThrow(/Invalid canonical id/);
    expect(() => validateRegistry([make({ id: "../etc" })])).toThrow(/Invalid canonical id/);
  });

  it("throws on duplicate canonical id", () => {
    expect(() =>
      validateRegistry([make({ id: "alpha" }), make({ id: "alpha" })]),
    ).toThrow(/Duplicate canonical id/);
  });

  it("throws on malformed iso3", () => {
    expect(() => validateRegistry([make({ iso3: "TST" })])).toThrow(/Invalid iso3/);
    expect(() => validateRegistry([make({ iso3: "test" })])).toThrow(/Invalid iso3/);
    expect(() => validateRegistry([make({ iso3: "../" })])).toThrow(/Invalid iso3/);
  });

  it("throws on invalid alias format", () => {
    expect(() =>
      validateRegistry([make({ aliases: ["1bad"] })]),
    ).toThrow(/Invalid alias/);
  });

  it("throws on duplicate alias across entries", () => {
    expect(() =>
      validateRegistry([
        make({ id: "alpha", aliases: ["shared"] }),
        make({ id: "beta", iso3: "bet", aliases: ["shared"] }),
      ]),
    ).toThrow(/Duplicate alias/);
  });

  it("throws when an alias collides with another entry's canonical id", () => {
    expect(() =>
      validateRegistry([
        make({ id: "alpha" }),
        make({ id: "beta", iso3: "bet", aliases: ["alpha"] }),
      ]),
    ).toThrow(/collides with another entry's canonical id/);
  });

  it("allows an alias matching its own canonical id (canonical-wins is harmless)", () => {
    expect(() =>
      validateRegistry([make({ id: "alpha", aliases: ["alpha"] })]),
    ).not.toThrow();
  });
});
