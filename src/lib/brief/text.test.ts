import { describe, expect, it } from "vitest";
import { firstSentence } from "./text";

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
