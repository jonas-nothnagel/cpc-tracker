import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReducer } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import { buildBriefData } from "@/lib/brief/data";
import { scopeOf } from "@/lib/brief/compute";
import { briefFixture } from "@/lib/brief/test-fixture";
import { exploreReducer, initialExploreState, type ExploreState } from "@/lib/brief/explore/state";
import { buildExploreLayers } from "@/lib/brief/explore/layers";
import { LAYER_DATA } from "@/lib/brief/explore/test-layers";
import { Explore } from "./explore";

const SOURCE = briefFixture();
const DATA = buildBriefData(SOURCE, scopeOf(SOURCE, ["A", "B", "C"]), null);

const saved = { ctx: HTMLCanvasElement.prototype.getContext, fetch: globalThis.fetch };

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.fetch = vi.fn(async (url: string) => {
    const params = new URLSearchParams(String(url).split("?")[1]);
    const a = params.get("a")!;
    const b = params.get("b")!;
    const target = (id: string) => ({ id, text: `Verbatim text of commitment ${id}.`, sourceDocument: id[0], sourceLabel: id });
    return {
      ok: true,
      json: async () => ({
        pair: { targetAId: a, targetBId: b, alignment: "flagged", mechanism: "goal_conflict", description: "The AI's reading." },
        targetA: target(a),
        targetB: target(b),
      }),
    };
  }) as never;
});

afterEach(() => {
  cleanup();
  HTMLCanvasElement.prototype.getContext = saved.ctx;
  globalThis.fetch = saved.fetch;
});

function Harness({ initial }: { initial?: Partial<ExploreState> }) {
  const [state, dispatch] = useReducer(exploreReducer, { ...initialExploreState(), ...initial });
  return <Explore source={SOURCE} data={DATA} state={state} dispatch={dispatch} groups={["docs", "globe"]} />;
}

function renderExplore(initial?: Partial<ExploreState>) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <Harness initial={initial} />
    </NextIntlClientProvider>,
  );
}

const side = () => document.querySelector(".ex-side") as HTMLElement;

describe("Explore", () => {
  it("rests on the ring with the targets to review first and the strongest alignments", () => {
    renderExplore();
    expect(screen.getByRole("application", { name: /18 targets on a ring/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Targets to review first" })).toBeInTheDocument();
    expect(screen.getAllByTestId("explore-review-row")).toHaveLength(6);
    expect(screen.getAllByTestId("explore-strong-row").length).toBeGreaterThan(0);
  });

  it("puts a ranked target in the centre and says how it reads against the rest", () => {
    renderExplore();
    const first = screen.getAllByTestId("explore-review-row")[0];
    fireEvent.click(within(first).getByRole("button"));
    // B6: aligned with 4 of its 12 comparisons, potential misalignment with 7.
    expect(within(side()).getByText(/Aligned with 4 of the 12 targets it was compared with\./)).toBeInTheDocument();
    expect(within(side()).getByText(/Potential misalignment with 7\./)).toBeInTheDocument();
    expect(screen.getAllByTestId("explore-apart-row")).toHaveLength(7);
    expect(screen.queryAllByTestId("explore-strong-partner-row")).toHaveLength(0);
  });

  it("opens a comparison beside the ring and moves its other target to the centre", async () => {
    renderExplore({ focus: "B6" });
    const row = screen.getAllByTestId("explore-apart-row")[0];
    fireEvent.click(within(row).getByRole("button"));
    const pair = await screen.findByTestId("explore-pair");
    expect(await within(pair).findByText("The AI's reading.")).toBeInTheDocument();
    fireEvent.click(within(pair).getByRole("button", { name: "Put in the centre" }));
    // A6 is now in the centre: potential misalignment with all six B targets.
    expect(within(side()).getByText(/Aligned with 0 of the 12 targets/)).toBeInTheDocument();
    expect(within(side()).getByText(/Potential misalignment with 6\./)).toBeInTheDocument();
  });

  it("steps back to the target that was in the centre before", async () => {
    renderExplore({ focus: "B6" });
    fireEvent.click(within(screen.getAllByTestId("explore-apart-row")[0]).getByRole("button"));
    const pair = await screen.findByTestId("explore-pair");
    fireEvent.click(within(pair).getByRole("button", { name: "Put in the centre" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(within(side()).getByText(/Potential misalignment with 7\./)).toBeInTheDocument();
  });

  it("finds targets by their words and centres the one chosen", () => {
    renderExplore();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search the targets" }), { target: { value: "b5" } });
    expect(screen.getByText("1 target matches.")).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId("explore-result-row")).getByRole("button"));
    // B5: strongly aligned with A1-A4, potential misalignment with A6 and C4-C6.
    expect(within(side()).getByText(/Potential misalignment with 4\./)).toBeInTheDocument();
  });

  it("moves from seat to seat by keyboard, centres one with Enter and opens its comparison with Space", async () => {
    renderExplore();
    const ring = screen.getByRole("application");
    ring.focus();
    fireEvent.keyDown(ring, { key: "ArrowRight" });
    fireEvent.keyDown(ring, { key: "Enter" });
    // A1: aligned with all 12 targets it was compared with, 6 of them strongly.
    expect(within(side()).getByText(/Aligned with 12 of the 12 targets/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Strong alignments (6)" })).toBeInTheDocument();
    // Six seats on is the first of B (sorted against A1): Space opens its comparison.
    for (let i = 0; i < 6; i++) fireEvent.keyDown(ring, { key: "ArrowRight" });
    fireEvent.keyDown(ring, { key: " " });
    expect(await screen.findByTestId("explore-pair")).toBeInTheDocument();
    fireEvent.keyDown(ring, { key: "Escape" });
    expect(screen.queryByTestId("explore-pair")).toBeNull();
    fireEvent.keyDown(ring, { key: "Escape" });
    expect(screen.getByRole("heading", { name: "Targets to review first" })).toBeInTheDocument();
  });

  it("switches kinds of lines on and off, with their counts for the target in the centre", () => {
    renderExplore({ focus: "A1" });
    const lines = screen.getByRole("group", { name: "Lines" });
    const strong = within(lines).getByRole("button", { name: /Strong alignment/ });
    const moderate = within(lines).getByRole("button", { name: /Moderate alignment/ });
    expect(strong).toHaveAttribute("aria-pressed", "true");
    expect(moderate).toHaveAttribute("aria-pressed", "false");
    expect(strong).toHaveTextContent("6");
    fireEvent.click(moderate);
    expect(moderate).toHaveAttribute("aria-pressed", "true");
  });

  it("puts a whole document in the centre with its relations to every other document", () => {
    renderExplore();
    const docs = screen.getAllByTestId("explore-browse-row");
    expect(docs.map((row) => within(row).getByRole("button", { name: /^Document/ }).textContent)).toEqual([
      expect.stringContaining("Document A"),
      expect.stringContaining("Document B"),
      expect.stringContaining("Document C"),
    ]);
    fireEvent.click(within(docs[0]).getByRole("button", { name: /^Document A/ }));
    expect(within(side()).getByRole("heading", { name: "Document A" })).toBeInTheDocument();
    expect(within(side()).getByText("6 targets, 72 target pairs with the other documents")).toBeInTheDocument();
    const rows = screen.getAllByTestId("explore-arc-row");
    expect(rows).toHaveLength(2);
    // With Document B: six potential misalignments, all with A6.
    fireEvent.click(within(rows[0]).getAllByRole("button")[0]);
    expect(screen.getByRole("heading", { name: "Potential misalignment (6)" })).toBeInTheDocument();
    expect(screen.getAllByTestId("explore-arc-apart-row")).toHaveLength(5);
    // Its own targets, most potential misalignments first.
    expect(screen.getAllByTestId("explore-group-review-row")).toHaveLength(1);
  });

  it("opens a document to its targets and centres the one chosen", () => {
    renderExplore();
    const b = screen.getAllByTestId("explore-browse-row")[1];
    fireEvent.click(within(b).getByRole("button", { name: "Show the targets of Document B" }));
    const targets = within(b).getAllByTestId("explore-browse-target");
    expect(targets).toHaveLength(6);
    fireEvent.click(within(targets[5]).getByRole("button"));
    expect(within(side()).getByText(/Potential misalignment with 7\./)).toBeInTheDocument();
  });

  it("steps through the targets of the document in the centre", () => {
    renderExplore({ focus: "B5" });
    fireEvent.click(screen.getByRole("button", { name: /Next target/ }));
    // B6 is next in document B.
    expect(within(side()).getByText(/Potential misalignment with 7\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Next target/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Previous target/ }));
    expect(within(side()).getByText(/Potential misalignment with 4\./)).toBeInTheDocument();
  });

  it("lists every target of the document in the centre", () => {
    renderExplore({ focus: "doc:C" });
    expect(screen.getByRole("heading", { name: "All targets (6)" })).toBeInTheDocument();
    expect(screen.getAllByTestId("explore-group-target")).toHaveLength(6);
  });

  it("puts a policy area in the centre when the ring is grouped by that lens", () => {
    renderExplore({ group: "globe" });
    const agriculture = screen
      .getAllByTestId("explore-browse-row")
      .find((row) => row.textContent?.includes("Agriculture"))!;
    fireEvent.click(within(agriculture).getByRole("button", { name: /^Agriculture/ }));
    expect(within(side()).getByText("Policy area · Biodiversity")).toBeInTheDocument();
    expect(within(side()).getByRole("heading", { name: "Agriculture" })).toBeInTheDocument();
  });

  it("steps out with a click on empty space: first the comparison, then the centre", async () => {
    renderExplore({ focus: "B6" });
    fireEvent.click(within(screen.getAllByTestId("explore-apart-row")[0]).getByRole("button"));
    await screen.findByTestId("explore-pair");
    const ring = screen.getByRole("application");
    fireEvent.click(ring);
    expect(screen.queryByTestId("explore-pair")).toBeNull();
    expect(within(side()).getByText(/Potential misalignment with 7\./)).toBeInTheDocument();
    fireEvent.click(ring);
    expect(screen.getByRole("heading", { name: "Targets to review first" })).toBeInTheDocument();
  });

  it("goes back to all targets from a button on the ring", () => {
    renderExplore({ focus: "doc:B" });
    const ring = screen.getByRole("application");
    fireEvent.click(within(ring).getByRole("button", { name: /All targets/ }));
    expect(screen.getByRole("heading", { name: "Targets to review first" })).toBeInTheDocument();
  });

  it("shows every ranked target on request", () => {
    renderExplore();
    expect(screen.getAllByTestId("explore-review-row")).toHaveLength(6);
    const more = within(side()).getAllByRole("button", { name: /Show all/ })[0];
    fireEvent.click(more);
    // Every target with at least one potential misalignment: A6, B1-B6, C1-C6.
    expect(screen.getAllByTestId("explore-review-row")).toHaveLength(13);
  });

  it("groups the ring by a policy area lens on request", () => {
    renderExplore();
    const lens = screen.getByRole("button", { name: "Biodiversity" });
    fireEvent.click(lens);
    expect(lens).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("application", { name: /grouped by Biodiversity/ })).toBeInTheDocument();
  });
});

describe("Explore with finance and implementation", () => {
  const LAYERS = buildExploreLayers(LAYER_DATA, SOURCE);

  function renderLayered(initial?: Partial<ExploreState>) {
    function Layered() {
      const [state, dispatch] = useReducer(exploreReducer, { ...initialExploreState(), ...initial });
      return (
        <Explore source={SOURCE} data={DATA} state={state} dispatch={dispatch} groups={["docs", "globe"]} layers={LAYERS} />
      );
    }
    return render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <Layered />
      </NextIntlClientProvider>,
    );
  }

  it("offers the layers as switches, off at first", () => {
    renderLayered();
    const layers = screen.getByRole("group", { name: "Layers" });
    expect(within(layers).getByRole("button", { name: /Reported actions/ })).toHaveAttribute("aria-pressed", "false");
    expect(within(layers).getByRole("button", { name: /Budget lines/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps finance and implementation out of the column until they are switched on", () => {
    renderLayered({ focus: "A1" });
    expect(within(side()).queryByRole("heading", { name: "Reported actions" })).toBeNull();
    expect(within(side()).queryByRole("heading", { name: "Budget lines" })).toBeNull();
    expect(within(side()).queryByText("Limited progress")).toBeNull();
  });

  it("shows a target's reported actions, budget lines and NR7 status beside the ring", () => {
    renderLayered({ focus: "A1", layers: ["mitigation", "adaptation", "budget"] });
    expect(within(side()).getByText("1 strongly aligned reported action.")).toBeInTheDocument();
    expect(within(side()).getByText("No matching budget line.")).toBeInTheDocument();
    expect(within(side()).getByText("Limited progress")).toBeInTheDocument();
    expect(screen.getAllByTestId("explore-action-strong")).toHaveLength(1);
  });

  it("puts a reported action in the centre with the targets it serves and may pull against", () => {
    renderLayered({ focus: "BTR_1" });
    expect(within(side()).getByText(/Reported mitigation action · Biennial Transparency Report \(BTR\)/)).toBeInTheDocument();
    expect(within(side()).getByText("Strongly aligned with 1 target. May pull against 1 target.")).toBeInTheDocument();
    expect(screen.getAllByTestId("explore-item-strong")).toHaveLength(1);
    expect(screen.getAllByTestId("explore-item-pull")).toHaveLength(1);
  });

  it("puts a whole layer in the centre and says how many targets it covers", () => {
    renderLayered({ layers: ["budget"] });
    const budget = screen
      .getAllByTestId("explore-browse-row")
      .find((row) => row.textContent?.includes("Budget lines (BER)"))!;
    fireEvent.click(within(budget).getByRole("button", { name: /^Budget lines \(BER\)/ }));
    expect(within(side()).getByText("1 of 18 targets have a matching budget line.")).toBeInTheDocument();
  });

  it("copies a link to the view in the centre", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderLayered({ focus: "A1" });
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(await screen.findByRole("button", { name: "Link copied" })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("focus=A1"));
  });
});

describe("Explore: every comparison of the centre", () => {
  it("lists every comparison of a target by reading, on request", () => {
    renderExplore({ focus: "B5" });
    const toggle = screen.getByRole("button", { name: "See all 12 comparisons" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    // B5: 4 potential misalignments, 4 strong alignments, 4 partial.
    const all = document.querySelector(".ex-all") as HTMLElement;
    expect(within(all).getByRole("heading", { name: "Potential misalignment (4)" })).toBeInTheDocument();
    expect(within(all).getByRole("heading", { name: "Strong alignment (4)" })).toBeInTheDocument();
    expect(within(all).getByRole("heading", { name: "Partial alignment (4)" })).toBeInTheDocument();
    expect(screen.getAllByTestId("explore-all-flagged")).toHaveLength(4);
    // The short lists stay where they are; the full list opens after them.
    expect(screen.getAllByTestId("explore-apart-row")).toHaveLength(4);
  });
});

describe("Explore: how to read", () => {
  // The walkthrough's overlay follows its target's size; jsdom has no ResizeObserver.
  const savedObserver = globalThis.ResizeObserver;
  beforeEach(() => {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });
  afterEach(() => {
    globalThis.ResizeObserver = savedObserver;
  });

  it("walks through the ring from a quiet link beside the controls", async () => {
    renderExplore();
    fireEvent.click(screen.getByRole("button", { name: "How to read" }));
    expect(await screen.findByText("Every target on one ring")).toBeInTheDocument();
  });
});

describe("Explore: a document's problems, without leaving it", () => {
  it("unfolds a target to review first into its potential misalignments", async () => {
    renderExplore({ focus: "doc:A" });
    const row = screen.getAllByTestId("explore-group-review-row")[0];
    fireEvent.click(within(row).getByRole("button", { name: /Show the potential misalignments of/ }));
    // A6: potential misalignment with all six B targets.
    const pairs = within(row).getAllByTestId("explore-member-apart");
    expect(pairs).toHaveLength(6);
    fireEvent.click(within(pairs[0]).getByRole("button"));
    expect(await screen.findByTestId("explore-pair")).toBeInTheDocument();
  });

  it("opens another document beside the centre, and can put it in the centre", () => {
    renderExplore({ focus: "doc:A" });
    const b = screen.getAllByTestId("explore-arc-row")[0];
    fireEvent.click(within(b).getAllByRole("button")[0]);
    expect(within(b).getAllByTestId("explore-arc-apart-row").length).toBeGreaterThan(0);
    fireEvent.click(within(b).getByRole("button", { name: "Put Document B in the centre" }));
    expect(within(side()).getByRole("heading", { name: "Document B" })).toBeInTheDocument();
  });
});
