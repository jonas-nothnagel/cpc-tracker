import { describe, expect, it } from "vitest";
import { lensName, lensTooltip } from "./lens-tooltip";

// Stands in for useTranslations("briefing.lens"): the key comes back, so a
// test sees which catalog entry a lens would read.
const tl = (key: string) => `briefing.lens.${key}`;

describe("lensName", () => {
  it("names a lens by its own name, else the catalog", () => {
    expect(lensName({ id: "own", name: "National priorities" }, tl)).toBe("National priorities");
    expect(lensName({ id: "globe" }, tl)).toBe("briefing.lens.globe");
  });

  it("falls back to the catalog for an own lens without a name", () => {
    expect(lensName({ id: "own" }, tl)).toBe("briefing.lens.own");
  });
});

describe("lensTooltip", () => {
  it("explains an own lens without a source line", () => {
    expect(lensTooltip({ id: "own" }, tl)).toBe("briefing.lens.ownTooltip");
  });

  it("keeps the source line an upload gave its policy areas", () => {
    expect(lensTooltip({ id: "own", tooltip: "National Development Plan 2021-2030" }, tl)).toBe(
      "National Development Plan 2021-2030",
    );
  });

  it("explains the global lenses the catalog explains, and no other", () => {
    expect(lensTooltip({ id: "gga" }, tl)).toBe("briefing.lens.ggaTooltip");
    expect(lensTooltip({ id: "globe" }, tl)).toBeUndefined();
  });
});
