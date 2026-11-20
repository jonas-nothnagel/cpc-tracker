import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import mn from "../../../../messages/mn.json";
import type { Currency } from "@/components/brief/contracts/money";
import type { BriefSource } from "@/lib/brief/source";
import { spendingSetup } from "@/lib/brief/spending";
import { levelsPayload } from "@/lib/brief/spending-fixture";
import { briefFixture } from "@/lib/brief/test-fixture";
import { SpendingSection } from "./spending-section";

// The documents on the reviewed-spending chart: a thin line at the date each
// came out, down across the bars, its code on top; those from outside the
// charted years, and those without a date, named in a line each under it.

const SOURCE = briefFixture();
/** Tugrik billion, charting 2020 (₮4, US$2.0 million), 2021 (₮6, US$2.4
 *  million) and 2022 (the local budgets only: ₮5, US$1.67 million). */
const LEVELS = spendingSetup(levelsPayload(), SOURCE)!;

/** The fixture's documents (A, B, C) with the dates their configs would state. */
function dated(dates: Record<string, string>): BriefSource {
  return { ...SOURCE, documents: SOURCE.documents.map((d) => (dates[d.id] ? { ...d, publishedOn: dates[d.id] } : d)) };
}

function section(source: BriefSource, { docs = ["A", "B", "C"], currency = "usd" as Currency, locale = "en" } = {}) {
  return (
    <NextIntlClientProvider locale={locale} messages={locale === "mn" ? (mn as unknown as typeof en) : en}>
      <SpendingSection setup={LEVELS} source={source} docs={docs} currency={currency} />
    </NextIntlClientProvider>
  );
}

afterEach(cleanup);

/** Each line: its year, its place in the year's column, the line it is raised by, its code. */
const lines = (c: HTMLElement) =>
  [...c.querySelectorAll<HTMLElement>(".sp-docline")].map((l) => [
    l.closest(".sp-year")?.querySelector(".sp-year-label")?.textContent,
    l.style.left,
    l.style.getPropertyValue("--lane"),
    l.textContent,
  ]);
const foot = (c: HTMLElement) => [...c.querySelectorAll(".sp-docs-out")].map((p) => p.textContent);

describe("the documents on the chart of the years", () => {
  it("draws a line at the month each came out, the middle of its year where only the year is known", () => {
    const { container } = render(section(dated({ A: "2020-01", B: "2022", C: "2021-12" })));
    expect(lines(container)).toEqual([
      ["2020", `${(0.5 / 12) * 100}%`, "0", "A"],
      ["2021", `${(11.5 / 12) * 100}%`, "0", "C"],
      ["2022", "50%", "1", "B"],
    ]);
    // The line is named once, in the legend.
    expect([...container.querySelectorAll(".sp-legend li")].map((li) => li.textContent)).toContain("Document came out");
  });

  it("raises a code a line where another stands within a column and a half of it", () => {
    const { container } = render(section(dated({ A: "2020-06", B: "2021-03", C: "2022-12" })));
    expect(lines(container).map(([year, , lane]) => [year, lane])).toEqual([
      ["2020", "0"],
      ["2021", "1"],
      ["2022", "0"],
    ]);
    expect(container.querySelector<HTMLElement>(".sp-plot")?.style.getPropertyValue("--sp-doc-lanes")).toBe("2");
  });

  it("gives a document's full name and date on pointing at its code, the month where its config states one", () => {
    const { container } = render(section(dated({ A: "2020-05", B: "2022" })));
    expect([...container.querySelectorAll<HTMLElement>(".sp-docline-code")].map((n) => n.title)).toEqual(["Document A, May 2020", "Document B, 2022"]);
  });

  it("names those from before and after the charted years under the chart, each year once", () => {
    const { container } = render(section(dated({ A: "2016", B: "2025-03", C: "2025-09" })));
    expect(lines(container)).toEqual([]);
    expect(foot(container)).toEqual(["Came out before 2020: A (2016)", "Came out after 2022: B, C (2025)"]);
    expect([...container.querySelectorAll<HTMLElement>(".sp-doc-name")].map((n) => n.title)).toEqual([
      "Document A, 2016",
      "Document B, March 2025",
      "Document C, September 2025",
    ]);
    // With no line on the chart, the chart is as it was.
    expect(container.querySelector(".sp-plot")?.hasAttribute("data-docs")).toBe(false);
  });

  it("names the documents without a date on a line of their own, and reads only the documents in the brief", () => {
    const all = render(section(dated({ A: "2021" })));
    expect(lines(all.container).map(([, , , code]) => code)).toEqual(["A"]);
    expect(foot(all.container)).toEqual(["Date not in the data: B, C"]);
    cleanup();
    const some = render(section(dated({ A: "2021", B: "2016" }), { docs: ["A"] }));
    expect(lines(some.container).map(([, , , code]) => code)).toEqual(["A"]);
    expect(foot(some.container)).toEqual([]);
  });

  it("leaves the chart as it was where no document in the brief states a date", () => {
    const { container } = render(section(dated({ A: "2021" }), { docs: ["B", "C"] }));
    expect(container.querySelector(".sp-plot")?.hasAttribute("data-docs")).toBe(false);
    expect(container.querySelector(".sp-docs-foot")).toBeNull();
    expect(container.querySelectorAll(".sp-docline")).toHaveLength(0);
    expect([...container.querySelectorAll(".sp-legend li")].map((li) => li.textContent)).not.toContain("Document came out");
  });

  it("says each line's document and date to a reader who does not see the chart", () => {
    const { container } = render(section(dated({ A: "2020-05", C: "2022" })));
    expect(container.querySelector(".sp-plot")?.getAttribute("aria-hidden")).toBe("true");
    expect([...container.querySelectorAll(".sp-docs-foot .brief-sr-only li")].map((li) => li.textContent)).toEqual([
      "Document A, May 2020",
      "Document C, 2022",
    ]);
  });

  it("writes a Mongolian date itself, never by the browser's calendar", () => {
    const { container } = render(section(dated({ A: "2020-05" }), { locale: "mn" }));
    expect(container.querySelector<HTMLElement>(".sp-docline-code")?.title).toBe("Document A, 2020 оны 5-р сар");
  });
});
