import { describe, expect, it } from "vitest";

import { slugifyAnchorId } from "./anchor";

describe("slugifyAnchorId", () => {
  it("slugifies an English storyline name", () => {
    expect(slugifyAnchorId("Link restoration systems across land agendas")).toBe(
      "link-restoration-systems-across-land-agendas",
    );
  });

  it("keeps accented letters, drops punctuation", () => {
    expect(slugifyAnchorId("Panamá: ¿bosques + REDD+?")).toBe(
      "panamá-bosques-redd",
    );
  });

  it("keeps Cyrillic letters (Mongolian storylines)", () => {
    expect(slugifyAnchorId("Нөхөн сэргээлтийн тогтолцоо")).toBe(
      "нөхөн-сэргээлтийн-тогтолцоо",
    );
  });

  it("returns null for punctuation-only text", () => {
    expect(slugifyAnchorId("·—··")).toBeNull();
    expect(slugifyAnchorId("")).toBeNull();
  });

  it("caps length at 128", () => {
    const slug = slugifyAnchorId("x".repeat(300));
    expect(slug).toHaveLength(128);
  });
});
