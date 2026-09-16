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
  it("shows the opened target's links, with a repeating counterpart marked on its flagged pair; the default view is the top row, not a second list", () => {
    // NDC_1 flagged against NT04 and NT01: it repeats.
    const m = buildNr7Report(FIXTURE_NR7, [...FIXTURE_ALIGNMENT, flagged, flag("NBSAP_1", "NDC_1")], FIXTURE_TARGETS)!;
    const recurring = rankPolicyLinkCandidates(m)!.recurring!;
    const row = m.targets.find((t) => t.targetId === "NT04")!;
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <Nr7TargetLinks row={row} isDefault countryConfig={null} countryName="Testland" visibleTargetIds={new Set()} onOpenTarget={vi.fn()} recurring={recurring} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByTestId("recurring-counterparts")).toBeNull();
    expect(screen.getByText("What lines up with national target 4")).toBeInTheDocument();
    expect(screen.getByTestId("nr7-links-default")).toHaveTextContent("The top row on the slide. Open another row to change.");
    expect(screen.getByTestId("nr7-links-repeats")).toHaveTextContent("on 2 targets");
    expect(screen.getByTestId("nr7-links-repeats").closest('[data-review="true"]')).not.toBeNull();
  });

  it("names the target without its deadline, its rating and GBF filing, and nothing else in the header", () => {
    renderColumn({ isDefault: true });
    expect(screen.queryByTestId("nr7-links-repeats")).toBeNull();
    expect(screen.getByText("What lines up with national target 4")).toBeInTheDocument();
    expect(screen.getByText("Reduce pollution.")).toBeInTheDocument();
    expect(screen.getByText("No progress")).toBeInTheDocument();
    expect(screen.getByText("GBF T7")).toBeInTheDocument();
    // No sentence repeating the counts, no caveat: the slide's rows carry the one caveat.
    expect(screen.queryByText(/align strongly with it/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/AI-estimated|Bar length/);
  });

  it("lists one line per document with the aligned count and, when any, the count to review in the flag colour", () => {
    renderColumn();
    const lines = within(document.querySelector('[data-tour="nr7-links-list"]')!).getAllByRole("listitem");
    expect(lines.map((li) => li.textContent?.trim())).toEqual(["NDC2 aligned1 to review", "NAP1 aligned"]);
    expect(lines[0].querySelector("[style*='width']")).toBeNull();
    expect(within(lines[0]).getByText("1 to review")).toHaveStyle({ color: "#dc2626" });
    expect(within(lines[1]).queryByText(/to review/)).toBeNull();
  });

  it("lists the aligned targets per document, marks flagged pairs by colour and word, and opens a target", () => {
    const { onOpenTarget } = renderColumn({ visible: ["NDC_1", "NDC_2"] });
    // Top-level rows only: each closed details block still holds its inner list in the DOM.
    const docs = [...document.querySelectorAll('[data-tour="nr7-links-docs"] > li')] as HTMLElement[];
    expect(docs[0]).toHaveTextContent("NDC");
    // The summary count is the whole list (aligned and flagged); the per-document line above splits it.
    expect(docs[0].querySelector("summary > span:last-child")).toHaveTextContent("3");
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
    expect(document.body.textContent).not.toMatch(/\b(should|must|responsible|blame|ministry|contradict|tension|delivers|funds)\b/i);
  });

  it("keeps a document with only flagged pairs on the line and in the list", () => {
    // NBSAP_2 aligns HIGH with NDC_1 only; add a flagged pair to NAP_1.
    const m = buildNr7Report(FIXTURE_NR7, [...FIXTURE_ALIGNMENT, flag("NBSAP_2", "NAP_1")], FIXTURE_TARGETS)!;
    const nt02 = m.targets.find((t) => t.targetId === "NT02")!;
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <Nr7TargetLinks row={nt02} isDefault={false} countryConfig={null} countryName="T" visibleTargetIds={new Set()} onOpenTarget={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect([...document.querySelectorAll('[data-tour="nr7-links-list"] > li')].map((li) => li.textContent?.trim())).toEqual(["NDC1 aligned", "NAP0 aligned1 to review"]);
    expect([...document.querySelectorAll('[data-tour="nr7-links-docs"] > li > details > summary > span:last-child')].map((s) => s.textContent?.trim())).toEqual(["1", "1"]);
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
      expect(document.querySelector('[data-tour="nr7-links-list"]')).toBeNull();
      cleanup();
    }
  });
});
