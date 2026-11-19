import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import mn from "../../../../messages/mn.json";
import type { Currency } from "@/components/brief/contracts/money";
import type { BriefSource } from "@/lib/brief/source";
import { spendingSetup } from "@/lib/brief/spending";
import { levelsPayload } from "@/lib/brief/spending-fixture";
import { briefFixture } from "@/lib/brief/test-fixture";
import { SpendingSection } from "./spending-section";

// The documents on the reviewed-spending chart: each code over the year it
// came out, a dashed line down onto that year's bar, those from outside the
// charted years at the two ends; once one is chosen, the chart's own bars and
// one line say what was spent before, in and after its year.

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

/** Each year's codes over the bars, with the column they stand in and the line they are raised by. */
const tags = (c: HTMLElement) =>
  [...c.querySelectorAll<HTMLElement>(".sp-plot .sp-doc-cell")].map((cell) => [cell.style.gridColumn, cell.style.getPropertyValue("--lane"), cell.textContent]);
const end = (c: HTMLElement, side: "before" | "after") => c.querySelector(`.sp-doc-end[data-side="${side}"]`)?.textContent ?? null;
const choice = (c: HTMLElement, code: string) => [...c.querySelectorAll<HTMLButtonElement>(".sp-plot .sp-doc")].find((b) => b.textContent === code)!;
const inks = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>(".sp-plot .sp-year")].map((y) => y.dataset.when);
const figures = (c: HTMLElement) => [...c.querySelectorAll(".sp-docs-fig")].map((f) => f.textContent);

describe("the documents on the chart of the years", () => {
  it("sets each document's code over the year it came out, a year's own on lines of their own", () => {
    const { container } = render(section(dated({ A: "2020-05", B: "2022", C: "2020-01" })));
    // Two came out in 2020, the earlier first; none in 2021.
    expect(tags(container)).toEqual([
      ["1", "0", "CA"],
      ["3", "0", "B"],
    ]);
    expect(container.querySelector(".sp-plot")?.hasAttribute("data-tags")).toBe(true);
    // The line from the codes onto the bar is named once, in the legend.
    expect([...container.querySelectorAll(".sp-legend li")].map((li) => li.textContent)).toContain("Year a document came out");
  });

  it("raises a year's codes a line where the year before it carries codes too", () => {
    const { container } = render(section(dated({ A: "2020", B: "2021", C: "2022" })));
    expect(tags(container).map(([column, lane]) => [column, lane])).toEqual([
      ["1", "0"],
      ["2", "1"],
      ["3", "0"],
    ]);
  });

  it("gives a document's full name and date on pointing, the month where its config states one", () => {
    const { container } = render(section(dated({ A: "2020-05", B: "2022" })));
    expect([...container.querySelectorAll<HTMLElement>(".sp-plot .sp-doc")].map((n) => n.title)).toEqual(["Document A, May 2020", "Document B, 2022"]);
  });

  it("points those from before the charted years off the left end and those after off the right, with their year", () => {
    const { container } = render(section(dated({ A: "2016", B: "2021-03", C: "2025-11" })));
    expect(end(container, "before")).toBe("←2016A");
    expect(end(container, "after")).toBe("2025C→");
    expect(tags(container)).toEqual([["2", "0", "B"]]);
    // No column of their own: the years keep the width.
    expect(container.querySelectorAll(".sp-plot .sp-year")).toHaveLength(3);
  });

  it("names each year once at an end, its documents after it", () => {
    const { container } = render(section(dated({ A: "2025-03", B: "2025-09", C: "2026" })));
    expect([...container.querySelectorAll('.sp-doc-end[data-side="after"] .sp-doc-group')].map((g) => g.textContent)).toEqual(["2025AB", "2026C"]);
    expect(container.querySelector(".sp-plot")?.hasAttribute("data-tags")).toBe(false);
  });

  it("keeps the documents without a date on one grey line, and reads only the documents in the brief", () => {
    const all = render(section(dated({ A: "2021" })));
    expect(tags(all.container)).toEqual([["2", "0", "A"]]);
    expect(all.container.querySelector(".sp-docs-undated")?.textContent).toBe("Date not in the data: B, C");
    cleanup();
    const some = render(section(dated({ A: "2021", B: "2020" }), { docs: ["A"] }));
    expect(tags(some.container)).toEqual([["2", "0", "A"]]);
    expect(some.container.querySelector(".sp-docs-undated")).toBeNull();
  });

  it("leaves the chart as it was where no document in the brief states a date", () => {
    const { container } = render(section(dated({ A: "2021" }), { docs: ["B", "C"] }));
    expect(container.querySelector(".sp-plot")?.hasAttribute("data-docs")).toBe(false);
    expect(container.querySelector(".sp-docs-foot")).toBeNull();
    expect(container.querySelectorAll(".sp-plot > *")).toHaveLength(3);
    expect([...container.querySelectorAll(".sp-legend li")].map((li) => li.textContent)).not.toContain("Year a document came out");
  });

  it("writes a Mongolian date itself, never by the browser's calendar", () => {
    const { container } = render(section(dated({ A: "2020-05" }), { locale: "mn" }));
    expect(container.querySelector<HTMLElement>(".sp-plot .sp-doc")?.title).toBe("Document A, 2020 оны 5-р сар");
  });
});

describe("a document chosen on the chart", () => {
  it("leaves the bars as they are while none is chosen", () => {
    const { container } = render(section(dated({ C: "2021-03" })));
    expect(inks(container)).toEqual([undefined, undefined, undefined]);
    expect(container.querySelector(".sp-docs-chosen")).toBeNull();
    expect(choice(container, "C").getAttribute("aria-pressed")).toBe("false");
  });

  it("turns the chart's own bars pale before the document, hatched in its year, and leaves them blue after; its line goes to ink", () => {
    const { container } = render(section(dated({ A: "2020", C: "2021-03" })));
    fireEvent.click(choice(container, "C"));
    expect(inks(container)).toEqual(["before", "at", "after"]);
    expect(choice(container, "C").getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector(".sp-plot")?.hasAttribute("data-chosen")).toBe(true);
    expect([...container.querySelectorAll<HTMLElement>(".sp-doc-tag")].map((t) => [t.textContent, t.hasAttribute("data-chosen")])).toEqual([
      ["A", false],
      ["C", true],
    ]);
  });

  it("states the document, then what was spent before, in and after its year, each beside its ink", () => {
    const { container } = render(section(dated({ C: "2021-03" })));
    fireEvent.click(choice(container, "C"));
    expect(container.querySelector(".sp-docs-name")?.textContent).toBe("Document C, March 2021");
    // 2022 holds the local budgets only: what its data hold is a floor.
    expect(figures(container)).toEqual(["Before US$2 million", "2021 US$2.4 million", "After at least US$1.7 million"]);
    expect([...container.querySelectorAll<HTMLElement>(".sp-docs-fig .sp-key")].map((k) => k.dataset.when)).toEqual(["before", "at", "after"]);
  });

  it("states the amounts in the review's own currency where the page does", () => {
    const { container } = render(section(dated({ C: "2021-03" }), { currency: "mnt" }));
    fireEvent.click(choice(container, "C"));
    expect(figures(container)).toEqual(["Before ₮4 billion", "2021 ₮6 billion", "After at least ₮5 billion"]);
  });

  it("states only the sides the review holds a year on, for a document at either end", () => {
    const { container } = render(section(dated({ A: "2016", C: "2025-11" })));
    fireEvent.click(choice(container, "C"));
    expect(inks(container)).toEqual(["before", "before", "before"]);
    expect(figures(container)).toEqual(["Before at least US$6.1 million"]);
    fireEvent.click(choice(container, "A"));
    expect(inks(container)).toEqual(["after", "after", "after"]);
    expect(figures(container)).toEqual(["After at least US$6.1 million"]);
  });

  it("lets the document go on a second choice of it", () => {
    const { container } = render(section(dated({ C: "2021-03" })));
    fireEvent.click(choice(container, "C"));
    fireEvent.click(choice(container, "C"));
    expect(inks(container)).toEqual([undefined, undefined, undefined]);
    expect(container.querySelector(".sp-docs-chosen")).toBeNull();
  });

  it("lets the document go when it leaves the brief", () => {
    const source = dated({ B: "2020", C: "2021-03" });
    const { container, rerender } = render(section(source));
    fireEvent.click(choice(container, "C"));
    rerender(section(source, { docs: ["A", "B"] }));
    expect(inks(container)).toEqual([undefined, undefined, undefined]);
    expect(container.querySelector(".sp-docs-chosen")).toBeNull();
  });

  it("keeps the choices outside what is hidden from a screen reader, the bars inside it", () => {
    const { container } = render(section(dated({ A: "2016", C: "2021-03" })));
    expect(choice(container, "C").closest("[aria-hidden]")).toBeNull();
    expect(choice(container, "A").closest("[aria-hidden]")).toBeNull();
    expect([...container.querySelectorAll(".sp-plot > .sp-year")].every((y) => y.getAttribute("aria-hidden") === "true")).toBe(true);
  });
});
