import { describe, expect, it } from "vitest";
import { largestRemainder, sliceSquares, squaresFor, UNIT } from "./units";

describe("sliceSquares", () => {
  const items = [
    { id: "a", value: 12e9, cell: "2024" },
    { id: "b", value: 3e9, cell: "2024" },
    { id: "c", value: 1e9, cell: "2025" },
    { id: "d", value: 1e9, cell: "2025" },
    { id: "e", value: 3e9, cell: "2025" },
  ];

  it("accounts for every square and keeps each cell's squares together", () => {
    const s = sliceSquares(items, 4, ["2024", "2025"]);
    expect(s).toHaveLength(4);
    expect(s.map((x) => x.cell)).toEqual(["2024", "2024", "2024", "2025"]);
  });

  it("names the contract holding most of a square, from the square's own cell", () => {
    const s = sliceSquares(items, 4, ["2024", "2025"]);
    expect(s[0].main).toBe("a");
    expect(s[3].main).toBe("e");
    expect(s[3].parts).toBeGreaterThan(1);
  });

  it("gives a square shared across two cells to the cell holding most of it, and its contract from that cell", () => {
    // 2024 holds 6 of the second square's 10; its largest item there is "b".
    const s = sliceSquares(
      [
        { id: "a", value: 10, cell: "2024" },
        { id: "b", value: 4, cell: "2024" },
        { id: "c", value: 2, cell: "2024" },
        { id: "big", value: 4, cell: "2025" },
      ],
      2,
      ["2024", "2025"],
    );
    expect(s[1].cell).toBe("2024");
    expect(s[1].main).toBe("b");
  });

  it("puts items of an unknown cell last", () => {
    const s = sliceSquares(
      [
        { id: "x", value: 5, cell: "elsewhere" },
        { id: "y", value: 5, cell: "2024" },
      ],
      2,
      ["2024"],
    );
    expect(s.map((q) => q.main)).toEqual(["y", "x"]);
  });

  it("returns nothing for no squares", () => {
    expect(sliceSquares(items, 0, ["2024"])).toEqual([]);
  });
});

describe("largestRemainder", () => {
  it("sums to the total", () => {
    expect(largestRemainder([1, 1, 1], 10)).toEqual([4, 3, 3]);
    expect(largestRemainder([0, 0], 5)).toEqual([0, 0]);
    expect(largestRemainder([2.5, 7.5], 4)).toEqual([1, 3]);
  });
});

describe("squaresFor", () => {
  it("rounds to the unit, at least one square for any money", () => {
    expect(squaresFor(12.4e9)).toBe(2);
    expect(squaresFor(1e6)).toBe(1);
    expect(squaresFor(0)).toBe(0);
    expect(UNIT).toBe(5e9);
  });
});
