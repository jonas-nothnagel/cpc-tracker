import { describe, expect, it } from "vitest";
import { docCodeSegments, firstSentence } from "./text";

describe("firstSentence", () => {
  it("splits an AI paragraph after its first sentence", () => {
    expect(firstSentence("Both expand restoration. They also share monitoring.")).toEqual({
      first: "Both expand restoration.",
      rest: "They also share monitoring.",
    });
  });

  it("does not break inside a document reference such as Res. 91", () => {
    const text = "FSS expands new cropland, while Res. 91 also pursues growth. A second sentence follows.";
    expect(firstSentence(text).first).toBe("FSS expands new cropland, while Res. 91 also pursues growth.");
  });

  it("does not break after common abbreviations", () => {
    expect(firstSentence("It covers e.g. Water resources. Then more.").first).toBe(
      "It covers e.g. Water resources.",
    );
  });

  it("splits Cyrillic sentences too", () => {
    expect(firstSentence("Эхний өгүүлбэр. Хоёр дахь өгүүлбэр.").first).toBe("Эхний өгүүлбэр.");
  });

  it("keeps a single sentence whole", () => {
    expect(firstSentence("Only one sentence here.")).toEqual({ first: "Only one sentence here.", rest: "" });
  });
});

describe("docCodeSegments", () => {
  const docs = [
    { id: "FSS", code: "FSS", name: "Food Supply and Security Measures" },
    { id: "NRVTS", code: "LDN", name: "LDN Targets" },
    { id: "SECTORAL", code: "Vision 2050", name: "Vision 2050" },
  ];

  it("marks the documents' codes in an AI text with their names", () => {
    expect(docCodeSegments("Joint screening across FSS, NRVTS and Vision 2050 could help.", docs)).toEqual([
      "Joint screening across ",
      { code: "FSS", name: "Food Supply and Security Measures" },
      ", ",
      { code: "NRVTS", name: "LDN Targets" },
      " and Vision 2050 could help.",
    ]);
  });

  it("leaves words that only contain a code alone", () => {
    expect(docCodeSegments("FSSs and NRVTS-like goals", docs)).toEqual(["FSSs and ", { code: "NRVTS", name: "LDN Targets" }, "-like goals"]);
  });

  it("marks document ids only, so a general term like LDN stays as written", () => {
    expect(docCodeSegments("NRVTS supports LDN objectives.", docs)).toEqual([
      { code: "NRVTS", name: "LDN Targets" },
      " supports LDN objectives.",
    ]);
  });

  it("only reads capitalised ids of three or more characters as codes", () => {
    const short = [{ id: "A", name: "Document A" }, ...docs];
    expect(docCodeSegments("A and B on land", short)).toEqual(["A and B on land"]);
  });

  it("returns the text whole when it names no document by code", () => {
    expect(docCodeSegments("No codes here.", docs)).toEqual(["No codes here."]);
  });
});
