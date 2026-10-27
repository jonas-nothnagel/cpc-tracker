import { describe, expect, it } from "vitest";
import { documentColors, documentName, isValidCode, pairCount, suggestCode } from "./documents";

describe("documentName", () => {
  it("reads a file name as a document's name", () => {
    expect(documentName("NDC_3.0-Sri Lanka.pdf")).toBe("NDC 3.0 Sri Lanka");
    expect(documentName("  Plan__national   de   adaptación .docx")).toBe("Plan national de adaptación");
  });

  it("keeps a long name to 120 characters", () => {
    expect(documentName(`${"a".repeat(200)}.pdf`)).toHaveLength(120);
  });
});

describe("suggestCode", () => {
  it("suggests the framework a name holds", () => {
    expect(suggestCode("Updated NDC 2021", [])).toBe("NDC");
    expect(suggestCode("National Biodiversity Strategy and Action Plan 2016-2022", [])).toBe("NBSAP");
    expect(suggestCode("National Adaptation Plan", [])).toBe("NAP");
    expect(suggestCode("Land Degradation Neutrality targets", [])).toBe("LDN");
  });

  it("otherwise takes the capital initials", () => {
    expect(suggestCode("National Water Resource Policy", [])).toBe("NWRP");
  });

  it("numbers a code that is taken", () => {
    expect(suggestCode("National Water Resource Policy", ["NWRP"])).toBe("NWRP2");
    expect(suggestCode("Second NDC", ["NDC"])).toBe("NDC2");
  });

  it("falls back to DOC1, DOC2 for a name without Latin capitals", () => {
    expect(suggestCode("Үндэсний хөтөлбөр", [])).toBe("DOC1");
    expect(suggestCode("Үндэсний хөтөлбөр", ["DOC1"])).toBe("DOC2");
  });
});

describe("isValidCode", () => {
  it("takes short Latin codes the pipeline gives no meaning of its own", () => {
    expect([isValidCode("BTR"), isValidCode("NWRP"), isValidCode("1A"), isValidCode("NWRP-2")]).toEqual([
      false,
      true,
      false,
      false,
    ]);
  });
});

describe("documentColors", () => {
  it("gives a framework its colour and every other document the next palette colour", () => {
    expect(documentColors(["NAP", "NWRP", "NDC", "X"])).toEqual(["#0e7490", "#4f46e5", "#0468b1", "#9d174d"]);
  });
});

describe("pairCount", () => {
  it("counts every pair of targets from two different documents", () => {
    expect(pairCount([56, 11, 22])).toBe(2090);
  });

  it("adds every reported action with every target", () => {
    expect(pairCount([56, 11, 22], 27)).toBe(2090 + 27 * 89);
  });
});
