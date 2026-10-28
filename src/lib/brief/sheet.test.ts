import { describe, expect, it } from "vitest";
import { briefDate, fitLines, mongolianDate } from "./sheet";

describe("briefDate", () => {
  const iso = "2026-09-23T10:00:00.000Z";

  it("dates English day first, as UNDP style asks", () => {
    expect(briefDate(iso, "en")).toBe("23 September 2026");
  });

  it("uses the Spanish long form", () => {
    expect(briefDate(iso, "es")).toBe("23 de septiembre de 2026");
  });

  it("spells the Mongolian date itself, the same in every browser", () => {
    expect(briefDate(iso, "mn")).toBe("2026 оны 9-р сарын 23");
  });
});

describe("mongolianDate", () => {
  it("spells a date, or its month alone, the same in every browser", () => {
    expect(mongolianDate(new Date("2026-02-01T00:00:00Z"))).toBe("2026 оны 2-р сарын 1");
    expect(mongolianDate(new Date("2026-02-01T00:00:00Z"), { day: false })).toBe("2026 оны 2-р сар");
    expect(mongolianDate(new Date("2025-12-31T23:30:00Z"), { day: false })).toBe("2025 оны 12-р сар");
  });

  it("leaves the year out where the date is read within one", () => {
    expect(mongolianDate(new Date("2026-06-02T00:00:00Z"), { year: false })).toBe("6-р сарын 2");
    expect(mongolianDate(new Date("2026-06-02T00:00:00Z"), { day: false, year: false })).toBe("6-р сар");
  });

  it("reads the date in UTC, so the server and every browser agree wherever they are", () => {
    // In a UTC process local and UTC getters agree, so only a Date whose own
    // local getters fail shows which ones the speller reads.
    const date = new Date("2026-02-01T00:00:00Z");
    for (const local of ["getFullYear", "getMonth", "getDate"] as const) {
      date[local] = () => {
        throw new Error(`${local} reads the machine's time zone`);
      };
    }
    expect(mongolianDate(date)).toBe("2026 оны 2-р сарын 1");
  });
});

describe("fitLines", () => {
  it("fits as many whole lines as the space holds, up to the maximum", () => {
    expect(fitLines(100, 20, 4)).toBe(4);
    expect(fitLines(79, 20, 4)).toBe(3);
    expect(fitLines(41, 20, 4)).toBe(2);
  });

  it("keeps at least one line so the text never disappears", () => {
    expect(fitLines(5, 20, 4)).toBe(1);
    expect(fitLines(0, 20, 4)).toBe(1);
  });
});
