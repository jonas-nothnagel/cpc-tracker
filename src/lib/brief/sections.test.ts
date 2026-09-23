import { describe, expect, it } from "vitest";
import { paginate } from "./sections";
import { DEFAULT_SECTIONS, SECTION_IDS } from "./selection";

describe("paginate", () => {
  it("lays the standard brief out on three pages", () => {
    expect(paginate(DEFAULT_SECTIONS)).toEqual([
      { title: true, sections: ["overall", "together"] },
      { title: false, sections: ["apart", "documents"] },
      { title: false, sections: ["map"] },
    ]);
  });

  it("moves a section that does not fit to the next page, keeping the order", () => {
    expect(paginate(["map", "overall"])).toEqual([
      { title: true, sections: [] },
      { title: false, sections: ["map"] },
      { title: false, sections: ["overall"] },
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
    expect(pages).toHaveLength(5);
  });
});
