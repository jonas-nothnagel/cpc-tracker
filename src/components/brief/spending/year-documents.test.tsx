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

// The documents under the years of the reviewed-spending chart: named by the
// year each came out, and, once one is chosen, the chart's own bars and one
// line saying what was spent before, in and after its year.

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

const cells = (c: HTMLElement) => [...c.querySelectorAll(".sp-plot .sp-docs")].map((n) => n.textContent);
const choice = (c: HTMLElement, code: string) => [...c.querySelectorAll<HTMLButtonElement>(".sp-plot .sp-doc")].find((b) => b.textContent === code)!;
const inks = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>(".sp-plot .sp-year:not(.sp-year-end)")].map((y) => y.dataset.when);
const figures = (c: HTMLElement) => [...c.querySelectorAll(".sp-docs-fig")].map((f) => f.textContent);

describe("the documents under the years", () => {
  it("names each document under the year it came out, below a title for the row", () => {
    const { container } = render(section(dated({ A: "2020-05", B: "2022", C: "2020-01" })));
    expect(container.querySelector(".sp-plot .sp-docs-title")?.textContent).toBe("Documents by year published");
    // Two came out in 2020, the earlier first; none in 2021.
    expect(cells(container)).toEqual(["CA", "", "B"]);
    expect(container.querySelector(".sp-docs-undated")).toBeNull();
    expect(container.querySelectorAll(".sp-year-end")).toHaveLength(0);
  });

  it("gives a document's full name and date on pointing, the month where its config states one", () => {
    const { container } = render(section(dated({ A: "2020-05", B: "2022" })));
    expect([...container.querySelectorAll<HTMLElement>(".sp-plot .sp-doc")].map((n) => n.title)).toEqual(["Document A, May 2020", "Document B, 2022"]);
  });

  it("names a document from before or after the charted years at that end of the axis, with its year", () => {
    const { container } = render(section(dated({ A: "2016", B: "2021-03", C: "2025-11" })));
    expect(cells(container)).toEqual(["A 2016", "", "B", "", "C 2025"]);
    // The two ends hold no bar: a column of their own, before and after the years.
    const columns = [...container.querySelectorAll(".sp-plot > .sp-year")];
    expect(columns).toHaveLength(5);
    expect([columns[0], columns[4]].every((col) => col.classList.contains("sp-year-end") && col.childElementCount === 0)).toBe(true);
  });

  it("keeps the documents without a date on one grey line, and reads only the documents in the brief", () => {
    const all = render(section(dated({ A: "2021" })));
    expect(cells(all.container)).toEqual(["", "A", ""]);
    expect(all.container.querySelector(".sp-docs-undated")?.textContent).toBe("Date not in the data: B, C");
    cleanup();
    const some = render(section(dated({ A: "2021", B: "2020" }), { docs: ["A"] }));
    expect(cells(some.container)).toEqual(["", "A", ""]);
    expect(some.container.querySelector(".sp-docs-undated")).toBeNull();
  });

  it("adds nothing to the chart where no document in the brief states a date", () => {
    const { container } = render(section(dated({ A: "2021" }), { docs: ["B", "C"] }));
    expect(container.querySelector(".sp-docs-title")).toBeNull();
    expect(container.querySelector(".sp-docs-foot")).toBeNull();
    expect(container.querySelectorAll(".sp-plot > *")).toHaveLength(3);
  });

  it("offers the same choices as a list, for a chart too narrow to hold a name under a year", () => {
    const { container } = render(section(dated({ A: "2021-03", B: "2016" })));
    expect([...container.querySelectorAll(".sp-docs-list .sp-doc")].map((b) => b.textContent)).toEqual(["2016 B", "2021 A"]);
  });

  it("writes a Mongolian date itself, never by the browser's calendar", () => {
    const { container } = render(section(dated({ A: "2020-05" }), { locale: "mn" }));
    expect(container.querySelector<HTMLElement>(".sp-plot .sp-doc")?.title).toBe("Document A, 2020 оны 5-р сар");
  });
});

describe("a document chosen under the years", () => {
  it("leaves the bars as they are while none is chosen", () => {
    const { container } = render(section(dated({ C: "2021-03" })));
    expect(inks(container)).toEqual([undefined, undefined, undefined]);
    expect(container.querySelector(".sp-docs-chosen")).toBeNull();
    expect(choice(container, "C").getAttribute("aria-pressed")).toBe("false");
  });

  it("turns the chart's own bars pale before the document, hatched in its year, and leaves them blue after", () => {
    const { container } = render(section(dated({ C: "2021-03" })));
    fireEvent.click(choice(container, "C"));
    expect(inks(container)).toEqual(["before", "at", "after"]);
    expect(choice(container, "C").getAttribute("aria-pressed")).toBe("true");
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

  it("states only the sides the review holds a year on", () => {
    const { container } = render(section(dated({ A: "2016", C: "2025-11" })));
    fireEvent.click(choice(container, "C 2025"));
    expect(inks(container)).toEqual(["before", "before", "before"]);
    expect(figures(container)).toEqual(["Before at least US$6.1 million"]);
    fireEvent.click(choice(container, "A 2016"));
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
    const { container } = render(section(dated({ C: "2021-03" })));
    expect(choice(container, "C").closest("[aria-hidden]")).toBeNull();
    expect([...container.querySelectorAll(".sp-plot > .sp-year")].every((y) => y.getAttribute("aria-hidden") === "true")).toBe(true);
  });
});
