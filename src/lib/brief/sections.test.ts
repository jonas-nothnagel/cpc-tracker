import { describe, expect, it } from "vitest";
import { paginate } from "./sections";
import { DEFAULT_SECTIONS, SECTION_IDS } from "./selection";

describe("paginate", () => {
  it("lays the standard brief out on three pages", () => {
    expect(DEFAULT_SECTIONS).toEqual([
      "overall",
      "together",
      "aligned",
      "apart",
      "commitments",
      "documents",
    ]);
    expect(paginate(DEFAULT_SECTIONS)).toEqual([
      { title: true, sections: ["overall", "together"] },
      { title: false, sections: ["aligned", "apart"] },
      { title: false, sections: ["commitments", "documents"] },
    ]);
  });

  it("moves a section that does not fit to the next page, keeping the order", () => {
    expect(paginate(["commitments", "documents", "apart"])).toEqual([
      { title: true, sections: ["commitments"] },
      { title: false, sections: ["documents", "apart"] },
    ]);
  });

  it("fills the space left on a page with a smaller section", () => {
    expect(paginate(["together", "overall", "apart"])).toEqual([
      { title: true, sections: ["together", "overall"] },
      { title: false, sections: ["apart"] },
    ]);
  });

  it("prints a title page even without sections", () => {
    expect(paginate([])).toEqual([{ title: true, sections: [] }]);
  });

  it("keeps every section, in order, when all are chosen", () => {
    const pages = paginate(SECTION_IDS);
    expect(pages.flatMap((p) => p.sections)).toEqual(SECTION_IDS);
    expect(SECTION_IDS).not.toContain("map");
    expect(pages).toHaveLength(4);
  });
});
