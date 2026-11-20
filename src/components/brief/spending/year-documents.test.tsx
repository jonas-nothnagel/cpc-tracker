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

// The brief's documents under the reviewed-spending chart, by when they came
// out against the charted years. Nothing is drawn on the bars: yearly
// spending cannot show what a document did.

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

const foot = (c: HTMLElement) => [...c.querySelectorAll(".sp-docs-out")].map((p) => p.textContent);

describe("the documents by when they came out", () => {
  it("names the documents from before, during and after the charted years, each year once, and draws nothing on the bars", () => {
    const { container } = render(section(dated({ A: "2016", B: "2021-03", C: "2025-09" })));
    expect(foot(container)).toEqual(["Documents from before 2020: A (2016)", "Documents from 2020–2022: B (2021)", "Documents from after 2022: C (2025)"]);
    // No document is named on the chart itself.
    expect(container.querySelector(".sp-plot")?.textContent).not.toMatch(/\b[ABC]\b/);
    expect([...container.querySelectorAll(".sp-legend li")].map((li) => li.textContent)).toEqual(["State budget", "Local budgets"]);
  });

  it("puts documents of one year together, earliest first", () => {
    const { container } = render(section(dated({ A: "2022", B: "2020-11", C: "2020-02" })));
    expect(foot(container)).toEqual(["Documents from 2020–2022: C, B (2020), A (2022)"]);
  });

  it("gives a document's full name and date on pointing, the month where its config states one", () => {
    const { container } = render(section(dated({ A: "2020-05", B: "2016" })));
    expect([...container.querySelectorAll<HTMLElement>(".sp-doc-name")].map((n) => n.title)).toEqual(["Document B, 2016", "Document A, May 2020", "Document C"]);
  });

  it("names the documents without a date on a line of their own, and reads only the documents in the brief", () => {
    const all = render(section(dated({ A: "2021" })));
    expect(foot(all.container)).toEqual(["Documents from 2020–2022: A (2021)", "Documents without a date: B, C"]);
    // An undated code still gives its full name on pointing.
    expect([...all.container.querySelectorAll<HTMLElement>(".sp-doc-name")].map((n) => n.title)).toEqual(["Document A, 2021", "Document B", "Document C"]);
    cleanup();
    const some = render(section(dated({ A: "2021", B: "2016" }), { docs: ["A"] }));
    expect(foot(some.container)).toEqual(["Documents from 2020–2022: A (2021)"]);
  });

  it("adds nothing where no document in the brief states a date", () => {
    const { container } = render(section(dated({ A: "2021" }), { docs: ["B", "C"] }));
    expect(container.querySelector(".sp-docs-foot")).toBeNull();
  });

  it("writes a Mongolian date itself, never by the browser's calendar", () => {
    const { container } = render(section(dated({ A: "2020-05" }), { locale: "mn" }));
    expect(container.querySelector<HTMLElement>(".sp-doc-name")?.title).toBe("Document A, 2020 оны 5-р сар");
  });
});
