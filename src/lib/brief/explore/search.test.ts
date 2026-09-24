import { describe, expect, it } from "vitest";
import { searchTargets } from "./search";

const ITEMS = [
  { label: "1 Protected areas", text: "Expand protected areas to 30% of the territory." },
  { label: "2 Water", text: "Secure water for pastures and irrigation." },
  { label: "Política 3", text: "Gestión integral del agua y los bosques." },
  { label: "4 Irrigated agriculture expansion", text: "Expand irrigated cropland." },
];

describe("searchTargets", () => {
  it("finds targets by a word of their label or text", () => {
    expect(searchTargets(ITEMS, "water")).toEqual([1]);
    expect(searchTargets(ITEMS, "irrigat")).toEqual([1, 3]);
  });

  it("ignores case and accents", () => {
    expect(searchTargets(ITEMS, "POLITICA")).toEqual([2]);
    expect(searchTargets(ITEMS, "gestion")).toEqual([2]);
  });

  it("needs every word of the query", () => {
    expect(searchTargets(ITEMS, "expand cropland")).toEqual([3]);
  });

  it("finds nothing for an empty or one-letter query", () => {
    expect(searchTargets(ITEMS, "")).toEqual([]);
    expect(searchTargets(ITEMS, " a ")).toEqual([]);
  });
});
