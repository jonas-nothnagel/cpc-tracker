import { describe, expect, it } from "vitest";
import { docDateLabel, markDocuments, parseDocDate } from "./doc-dates";

const doc = (id: string, publishedOn?: string) => ({ id, ...(publishedOn ? { publishedOn } : {}) });
const ids = (docs: { id: string }[]) => docs.map((d) => d.id);

describe("parseDocDate", () => {
  it("reads a year, or a year and a month", () => {
    expect(parseDocDate("2016")).toEqual({ year: 2016, month: null });
    expect(parseDocDate("2024-12")).toEqual({ year: 2024, month: 12 });
    expect(parseDocDate("2019-08")).toEqual({ year: 2019, month: 8 });
  });

  it("reads nothing else as a date: free text, a period, a day, a month that does not exist", () => {
    for (const value of ["September 2025", "2025-2029", "2025-9", "2025-13", "2025-00", "2025-09-01", "", " 2025", null, undefined, 2025]) {
      expect(parseDocDate(value)).toBeNull();
    }
  });
});

describe("markDocuments", () => {
  const years = [2016, 2017, 2018, 2019];

  it("puts each document under the charted year it came out in", () => {
    const marks = markDocuments([doc("A", "2016"), doc("B", "2018-03"), doc("C", "2019-12")], years)!;
    expect([...marks.byYear].map(([year, docs]) => [year, ids(docs)])).toEqual([
      [2016, ["A"]],
      [2018, ["B"]],
      [2019, ["C"]],
    ]);
    expect(marks.before).toEqual([]);
    expect(marks.after).toEqual([]);
    expect(marks.undated).toEqual([]);
  });

  it("reads the charted years as the chart writes them, as text or numbers", () => {
    const marks = markDocuments([doc("A", "2017")], ["2016", "2017"])!;
    expect(ids(marks.byYear.get(2017) ?? [])).toEqual(["A"]);
    expect([marks.first, marks.last]).toEqual([2016, 2017]);
  });

  it("keeps documents from before and after the charted years apart, earliest first", () => {
    const marks = markDocuments([doc("Late", "2026"), doc("Old", "2000"), doc("Older", "1998-06"), doc("Next", "2020-01"), doc("In", "2017")], years)!;
    expect(ids(marks.before)).toEqual(["Older", "Old"]);
    expect(ids(marks.after)).toEqual(["Next", "Late"]);
    expect(ids(marks.byYear.get(2017) ?? [])).toEqual(["In"]);
    expect(ids(marks.dated)).toEqual(["Older", "Old", "In", "Next", "Late"]);
  });

  it("orders a year's documents by month, a year alone first, then as the brief lists them", () => {
    const marks = markDocuments([doc("Sep", "2018-09"), doc("Mar", "2018-03"), doc("Year", "2018"), doc("Sep2", "2018-09")], years)!;
    expect(ids(marks.byYear.get(2018) ?? [])).toEqual(["Year", "Mar", "Sep", "Sep2"]);
  });

  it("keeps a document without a date apart, never under a year", () => {
    const marks = markDocuments([doc("A", "2016"), doc("None"), doc("Text", "2025-2029")], years)!;
    expect(ids(marks.undated)).toEqual(["None", "Text"]);
    expect([...marks.byYear.keys()]).toEqual([2016]);
  });

  it("keeps a document from a year the chart skips apart, never under a neighbouring year", () => {
    const marks = markDocuments([doc("Gap", "2018"), doc("A", "2016")], [2016, 2017, 2019])!;
    expect(ids(marks.between)).toEqual(["Gap"]);
    expect([...marks.byYear.keys()]).toEqual([2016]);
  });

  it("marks nothing where no document states a date, or no year is charted", () => {
    expect(markDocuments([doc("A"), doc("B")], years)).toBeNull();
    expect(markDocuments([], years)).toBeNull();
    expect(markDocuments([doc("A", "2016")], [])).toBeNull();
  });
});

describe("docDateLabel", () => {
  it("writes a year as it is, in every language", () => {
    for (const locale of ["en", "es", "mn"]) expect(docDateLabel("2016", locale)).toBe("2016");
  });

  it("writes a month in the page's language", () => {
    expect(docDateLabel("2024-12", "en")).toBe("December 2024");
    expect(docDateLabel("2024-12", "es")).toBe("diciembre de 2024");
  });

  it("spells a Mongolian month itself, never by the browser's calendar", () => {
    expect(docDateLabel("2026-02", "mn")).toBe("2026 оны 2-р сар");
  });

  it("shows a value that is not a date as it came", () => {
    expect(docDateLabel("2025-2029", "en")).toBe("2025-2029");
  });
});
