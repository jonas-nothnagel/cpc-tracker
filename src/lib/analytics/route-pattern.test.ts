import { describe, expect, it } from "vitest";

import { countryFromPath, toRoutePattern, ROUTE_PATTERNS } from "./route-pattern";

describe("toRoutePattern", () => {
  it("maps every known route", () => {
    expect(toRoutePattern("/")).toBe("/");
    expect(toRoutePattern("/dashboard")).toBe("/dashboard");
    expect(toRoutePattern("/upload")).toBe("/upload");
    expect(toRoutePattern("/methodology")).toBe("/methodology");
    expect(toRoutePattern("/sustainability")).toBe("/sustainability");
    expect(toRoutePattern("/prototypes")).toBe("/prototypes");
    expect(toRoutePattern("/mongolia/model-comparison")).toBe(
      "/[country]/model-comparison",
    );
    expect(toRoutePattern("/panama/model-evaluation")).toBe(
      "/[country]/model-evaluation",
    );
    expect(toRoutePattern("/panama")).toBe("/[country]");
    expect(toRoutePattern("/panama/upload")).toBe("/[country]/upload");
    expect(toRoutePattern("/mongolia/explore")).toBe("/[country]/explore");
    expect(toRoutePattern("/notacountry/explore")).toBe("/other");
    // The country segment is registry-validated for sub-pages too.
    expect(toRoutePattern("/notacountry/model-comparison")).toBe("/other");
    expect(toRoutePattern("/analysis/run-2026-07-01")).toBe("/analysis/[id]");
  });

  it("collapses unknown paths to /other, never storing them raw", () => {
    expect(toRoutePattern("/no/such/page")).toBe("/other");
    expect(toRoutePattern("/UPPERCASE")).toBe("/other");
    expect(toRoutePattern("/analysis")).toBe("/other");
    expect(toRoutePattern("/analysis/a/b")).toBe("/other");
  });

  it("normalizes trailing slashes", () => {
    expect(toRoutePattern("/dashboard/")).toBe("/dashboard");
    expect(toRoutePattern("")).toBe("/");
  });

  it("emits only patterns from the shared whitelist", () => {
    for (const path of ["/", "/panama", "/x/y/z", "/analysis/abc"]) {
      expect(ROUTE_PATTERNS.has(toRoutePattern(path))).toBe(true);
    }
  });
});

describe("countryFromPath", () => {
  it("extracts the country only from country-shaped routes", () => {
    expect(countryFromPath("/mongolia/explore")).toBe("mongolia");
    expect(countryFromPath("/panama")).toBe("panama");
    expect(countryFromPath("/panama/upload")).toBe("panama");
    expect(countryFromPath("/mongolia/model-comparison")).toBe("mongolia");
    expect(countryFromPath("/dashboard")).toBeNull();
    expect(countryFromPath("/")).toBeNull();
  });
});
