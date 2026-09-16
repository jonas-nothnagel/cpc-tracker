import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../messages/en.json";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));

import { Nr7TargetLinks } from "./nr7-target-links";
import { rankPolicyLinkCandidates } from "../sections/implementation/review-groups";
import { buildNr7Report } from "../nr7-report";
import { FIXTURE_ALIGNMENT, FIXTURE_NR7, FIXTURE_TARGETS } from "../nr7-report/test-fixture";
import type { AlignmentResult } from "@/types";

afterEach(cleanup);

const flag = (a: string, b: string): AlignmentResult => ({ targetAId: a, targetBId: b, alignment: "flagged", description: "why", mechanism: "delivery_friction", manageability: "manageable" });
const flagged = flag("NBSAP_4", "NDC_1");
const model = buildNr7Report(FIXTURE_NR7, [...FIXTURE_ALIGNMENT, flagged], FIXTURE_TARGETS)!;
const nt04 = model.targets.find((t) => t.targetId === "NT04")!;

function renderColumn(opts: { isDefault?: boolean; visible?: string[] } = {}) {
  const onOpenTarget = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <Nr7TargetLinks
        row={nt04}
        isDefault={opts.isDefault ?? false}
        countryConfig={null}
        countryName="Testland"
        visibleTargetIds={new Set(opts.visible ?? [...FIXTURE_TARGETS.keys()])}
        onOpenTarget={onOpenTarget}
      />
    </NextIntlClientProvider>,
  );
  return { onOpenTarget };
}

describe("Nr7TargetLinks", () => {
  it("shows where the flagged pairs repeat while no row is opened, and the opened target's links otherwise", () => {
    // NDC_1 flagged against NT04 and NT01: it repeats.
    const m = buildNr7Report(FIXTURE_NR7, [...FIXTURE_ALIGNMENT, flagged, flag("NBSAP_1", "NDC_1")], FIXTURE_TARGETS)!;
    const recurring = rankPolicyLinkCandidates(m)!.recurring!;
    const row = m.targets.find((t) => t.targetId === "NT04")!;
    const onOpenRow = vi.fn();
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <Nr7TargetLinks row={row} isDefault countryConfig={null} countryName="Testland" visibleTargetIds={new Set()} onOpenTarget={vi.fn()} recurring={recurring} onOpenRow={onOpenRow} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("recurring-counterparts")).toHaveTextContent("on 2 of 4 national targets, 1 behind schedule");
    expect(screen.queryByText("What lines up with national target 4")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "National target 4: rated No progress" }));
    expect(onOpenRow).toHaveBeenCalledWith("NT04");
    // A row opened: the target's links, with the repeating counterpart marked on its flagged pair.
    rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <Nr7TargetLinks row={row} isDefault={false} countryConfig={null} countryName="Testland" visibleTargetIds={new Set()} onOpenTarget={vi.fn()} recurring={recurring} onOpenRow={onOpenRow} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByTestId("recurring-counterparts")).toBeNull();
    expect(screen.getByText("What lines up with national target 4")).toBeInTheDocument();
    expect(screen.getByTestId("nr7-links-repeats")).toHaveTextContent("on 2 targets");
    expect(screen.getByTestId("nr7-links-repeats").closest('[data-review="true"]')).not.toBeNull();
  });

  it("names the target, its rating and GBF filing, and counts the links in words, standing in when nothing repeats", () => {
    renderColumn({ isDefault: true });
    expect(screen.queryByTestId("recurring-counterparts")).toBeNull();
    expect(screen.queryByTestId("nr7-links-repeats")).toBeNull();
    expect(screen.getByText("What lines up with national target 4")).toBeInTheDocument();
    expect(screen.getByText("No progress")).toBeInTheDocument();
    expect(screen.getByText("GBF T7")).toBeInTheDocument();
    expect(screen.getByText("3 policy targets in 2 other documents align strongly with it; 1 potential misalignment.")).toBeInTheDocument();
    expect(screen.getByTestId("nr7-links-default")).toHaveTextContent("The top-ranked target on the slide.");
  });

  it("draws one bar per document with the count beside it, and names the flagged ones", () => {
    renderColumn();
    const bars = within(document.querySelector('[data-tour="nr7-links-bars"]')!).getAllByRole("listitem");
    // Label and count are separate cells; textContent joins them without a space.
    expect(bars.map((li) => li.textContent?.trim())).toEqual(["NDC2", "NAP1"]);
    // The longest bar is the document with the most links; the other scales to it.
    const widths = bars.map((li) => (li.querySelector("span[aria-hidden] > span") as HTMLElement).style.width);
    expect(widths).toEqual(["100%", "50%"]);
    expect(screen.getByTestId("nr7-links-flagged")).toHaveTextContent("1 potential misalignment: NDC 1");
    expect(screen.getByText(/Bar length: how many of that document's targets/)).toBeInTheDocument();
  });

  it("lists the aligned targets per document, marks flagged pairs by colour and word, and opens a target", () => {
    const { onOpenTarget } = renderColumn({ visible: ["NDC_1", "NDC_2"] });
    // Top-level rows only: each closed details block still holds its inner list in the DOM.
    const docs = [...document.querySelectorAll('[data-tour="nr7-links-docs"] > li')] as HTMLElement[];
    expect(docs[0]).toHaveTextContent("NDC");
    expect(docs[0]).toHaveTextContent("2 + 1 to review");
    fireEvent.click(within(docs[0]).getByText("NDC"));
    const items = within(docs[0].querySelector("details > ul")!).getAllByRole("listitem");
    // The pair to review comes first, tinted and left-ruled, with the word as a pill.
    expect(items.map((li) => li.textContent?.trim())).toEqual(["NDC_1potential misalignment", "NDC_1", "NDC_2"]);
    expect(items[0].querySelector('[data-review="true"]')).not.toBeNull();
    expect(items[1].querySelector('[data-review="true"]')).toBeNull();
    fireEvent.click(within(items[1]).getByRole("button", { name: "NDC_1" }));
    expect(onOpenTarget).toHaveBeenCalledWith("NDC_1");
    // A counterpart hidden by the document toggle is text, not a link.
    fireEvent.click(within(docs[1]).getByText("NAP"));
    expect(within(docs[1]).queryByRole("button", { name: "NAP_1" })).toBeNull();
    expect(within(docs[1]).getByText("NAP_1")).toBeInTheDocument();
    expect(document.querySelector('[data-tour="nr7-links-caveat"]')).toHaveTextContent("AI-estimated alignment between target texts");
    expect(document.body.textContent).not.toMatch(/\b(should|must|responsible|blame|ministry|contradict|tension|delivers|funds)\b/i);
  });

  it("gives a document with only flagged pairs no bar, but keeps it in the misalignment line and the list", () => {
    // NBSAP_2 aligns HIGH with NDC_1 only; add a flagged pair to NAP_1.
    const m = buildNr7Report(FIXTURE_NR7, [...FIXTURE_ALIGNMENT, flag("NBSAP_2", "NAP_1")], FIXTURE_TARGETS)!;
    const nt02 = m.targets.find((t) => t.targetId === "NT02")!;
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <Nr7TargetLinks row={nt02} isDefault={false} countryConfig={null} countryName="T" visibleTargetIds={new Set()} onOpenTarget={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect([...document.querySelectorAll('[data-tour="nr7-links-bars"] > li')].map((li) => li.textContent?.trim())).toEqual(["NDC1"]);
    expect(screen.getByTestId("nr7-links-flagged")).toHaveTextContent("1 potential misalignment: NAP 1");
    // The count cell is the last span of each summary (the +/− toggles are decorative).
    expect([...document.querySelectorAll('[data-tour="nr7-links-docs"] > li > details > summary > span:last-child')].map((s) => s.textContent?.trim())).toEqual(["1", "0 + 1 to review"]);
  });

  it("unfolds a long document list on \"+ N more\" and folds it back", () => {
    const high = Array.from({ length: 8 }, (_, i) => ({ targetId: `NDC_${i + 1}`, doc: "NDC", label: `NDC ${i + 1}`, text: "t", level: "high" as const, mechanism: null }));
    const row = { ...nt04, policyLinks: { high, flagged: [], byDoc: [{ doc: "NDC", high: 8, flagged: 0 }], docs: 1 } };
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <Nr7TargetLinks row={row} isDefault={false} countryConfig={null} countryName="T" visibleTargetIds={new Set()} onOpenTarget={vi.fn()} />
      </NextIntlClientProvider>,
    );
    const doc = document.querySelector('[data-tour="nr7-links-docs"] > li')!;
    const items = () => [...doc.querySelectorAll("details > ul > li")].map((li) => li.textContent?.trim());
    expect(items()).toHaveLength(7); // six targets and the "+ 2 more" button
    fireEvent.click(within(doc as HTMLElement).getByRole("button", { name: "+ 2 more" }));
    expect(items()).toHaveLength(9);
    expect(items().at(-1)).toBe("Show fewer");
    fireEvent.click(within(doc as HTMLElement).getByRole("button", { name: "Show fewer" }));
    expect(items()).toHaveLength(7);
  });

  it("keeps the header and says so for a target with no NBSAP match or no links", () => {
    for (const policyLinks of [null, { high: [], flagged: [], byDoc: [], docs: 0 }]) {
      render(
        <NextIntlClientProvider locale="en" messages={en}>
          <Nr7TargetLinks row={{ ...nt04, policyLinks }} isDefault={false} countryConfig={null} countryName="T" visibleTargetIds={new Set()} onOpenTarget={vi.fn()} />
        </NextIntlClientProvider>,
      );
      expect(screen.getByText("What lines up with national target 4")).toBeInTheDocument();
      expect(screen.getByText("No progress")).toBeInTheDocument();
      expect(screen.getByTestId("nr7-links-none")).toHaveTextContent("No policy target in the other documents was judged strongly aligned with it.");
      expect(document.querySelector('[data-tour="nr7-links-bars"]')).toBeNull();
      expect(screen.queryByText(/align strongly with it/)).toBeNull();
      cleanup();
    }
  });
});
