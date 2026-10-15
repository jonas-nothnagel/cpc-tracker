import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReducer } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import { buildBriefData } from "@/lib/brief/data";
import { scopeOf } from "@/lib/brief/compute";
import { briefFixture } from "@/lib/brief/test-fixture";
import { exploreReducer, initialExploreState, type ExploreGroup, type ExploreState } from "@/lib/brief/explore/state";
import { buildExploreLayers } from "@/lib/brief/explore/layers";
import { buildExploreModel, groupByDocument } from "@/lib/brief/explore/model";
import { focusMembers, groupProfile, groupSeatOrder, parseFocusKey } from "@/lib/brief/explore/focus";
import { layoutRing } from "@/lib/brief/explore/ring";
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

  it("says on a paired seat how to compare it with the target in the centre", () => {
    // Lay the ring out: jsdom has no sizes.
    const saved = {
      w: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth"),
      h: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight"),
    };
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 800 });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 600 });
    try {
      renderExplore({ focus: "B6" });
      const ring = screen.getByRole("application");
      const card = () => document.querySelector(".ex-tip")?.textContent ?? "";
      // The first seat of A: compared with B6.
      fireEvent.keyDown(ring, { key: "ArrowRight" });
      expect(card()).toContain("Select to open the comparison");
      // The first seat of B: B6's own document, never compared with it.
      fireEvent.keyDown(ring, { key: "PageDown" });
      expect(card()).not.toBe("");
      expect(card()).not.toContain("Select to open the comparison");
      expect(card()).not.toContain("Select again");
    } finally {
      if (saved.w) Object.defineProperty(HTMLElement.prototype, "clientWidth", saved.w);
      if (saved.h) Object.defineProperty(HTMLElement.prototype, "clientHeight", saved.h);
    }
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

describe("Explore: a lens and its scope", () => {
  // A draft lens that places few targets: B5 and C4 engage its one area.
  const HR = {
    id: "hr" as const,
    taxonomyType: "hr",
    categories: [{ id: "hr1", name: "Right to water" }],
    primary: { B5: "hr1", C4: "hr1" },
  };
  const WITH_HR = { ...SOURCE, lenses: [...SOURCE.lenses, HR] };

  function LensHarness({
    initial,
    source = WITH_HR,
    groups = ["docs", "globe", "hr"],
  }: {
    initial?: Partial<ExploreState>;
    source?: typeof WITH_HR;
    groups?: ExploreGroup[];
  }) {
    const [state, dispatch] = useReducer(exploreReducer, { ...initialExploreState(), ...initial });
    return <Explore source={source} data={DATA} state={state} dispatch={dispatch} groups={groups} />;
  }
  const renderLens = (initial?: Partial<ExploreState>, source?: typeof WITH_HR, groups?: ExploreGroup[]) =>
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <LensHarness initial={initial} source={source} groups={groups} />
      </NextIntlClientProvider>,
    );
  // Lay the ring out: jsdom has no sizes, and the centre and the cards need room.
  function sized(run: () => void) {
    const w = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
    const h = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
    try {
      run();
    } finally {
      w.mockRestore();
      h.mockRestore();
    }
  }
  /** A ranked list beside the ring as "target value" rows. */
  const ranked = (testId: string) =>
    screen.queryAllByTestId(testId).map((row) => {
      const id = row.querySelector(".ex-rank-title")?.textContent?.match(/Commitment ([A-C]\d)/)?.[1];
      return `${id} ${row.querySelector(".ex-rank-value")?.textContent}`;
    });

  it("seats only the targets in the lens's areas, and says how many of all fall in one", () => {
    renderLens({ group: "globe" });
    expect(screen.getByRole("application", { name: /^9 targets on a ring, grouped by Biodiversity/ })).toBeInTheDocument();
    expect(screen.getByText("9 of the 18 targets fall in one of these areas.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Documents" }));
    expect(screen.getByRole("application", { name: /^18 targets on a ring, grouped by Documents/ })).toBeInTheDocument();
    expect(screen.queryByText(/fall in one of these areas/)).toBeNull();
  });

  // At rest the centre counts the pairs between the targets on the ring.
  // Biodiversity seats A1-A3, B4-B6 and C1-C3: A~B and A~C 9 aligned each,
  // B~C 6 partial (B4, B5 x C1-C3) and 3 potential misalignment (B6 x
  // C1-C3). Human rights seats B5 and C4: one pair, a potential misalignment.
  it("rests on the pairs between the targets the lens seats", () => {
    sized(() => {
      renderLens({ group: "globe" });
      const rest = () => document.querySelector(".ex-centre-rest") as HTMLElement;
      const key = () => [...rest().querySelectorAll(".ex-key li")].map((li) => li.textContent);
      expect(within(rest()).getByText("27")).toBeInTheDocument();
      expect(key()).toEqual(["67% aligned", "22% partially aligned", "11% potential misalignment"]);
      expect(within(rest()).getByText("9 targets in 3 documents")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Human rights" }));
      expect(within(rest()).getByText("1")).toBeInTheDocument();
      expect(within(rest()).getByText("target pair compared")).toBeInTheDocument();
      expect(key()).toEqual(["100% potential misalignment"]);
      expect(within(rest()).getByText("2 targets in 2 documents")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Documents" }));
      expect(within(rest()).getByText("108")).toBeInTheDocument();
      expect(key()).toEqual(["67% aligned", "19% partially aligned", "14% potential misalignment"]);
      expect(within(rest()).getByText("18 targets in 3 documents")).toBeInTheDocument();
    });
  });

  // The column at rest reads the same pairs. B6 is potentially misaligned
  // with C1-C3. A1-A3 align strongly with B5 and with C1 and C3: three
  // strong alignments each for A1-A3, B5, C1 and C3.
  it("ranks the targets the lens seats by their pairs with each other", () => {
    renderLens({ group: "globe" });
    expect(
      screen.getByRole("heading", {
        name: "Potential misalignment between the targets in these areas is spread across 4 targets.",
      }),
    ).toBeInTheDocument();
    expect(ranked("explore-review-row")).toEqual(["B6 3", "C1 1", "C2 1", "C3 1"]);
    expect(ranked("explore-strong-row")).toEqual(["A1 3", "A2 3", "A3 3", "B5 3", "C1 3", "C3 3"]);
    fireEvent.click(screen.getByRole("button", { name: "Human rights" }));
    expect(
      screen.getByRole("heading", {
        name: "Potential misalignment between the targets in this area is spread across 2 targets.",
      }),
    ).toBeInTheDocument();
    expect(ranked("explore-review-row")).toEqual(["B5 1", "C4 1"]);
    expect(ranked("explore-strong-row")).toEqual([]);
  });

  // A lens whose targets never pull against each other: A1 and B1 align
  // strongly. Each has potential misalignments only with targets it does not seat.
  it("says so when the targets a lens seats show no potential misalignment with each other", () => {
    const LOSS = {
      id: "lossDamage" as const,
      taxonomyType: "lossDamage",
      categories: [{ id: "ld1", name: "Loss and damage" }],
      primary: { A1: "ld1", B1: "ld1" },
    };
    renderLens({ group: "lossDamage" }, { ...SOURCE, lenses: [...SOURCE.lenses, LOSS] }, ["docs", "lossDamage"]);
    expect(
      screen.getByRole("heading", { name: "No potential misalignment between the targets in this area." }),
    ).toBeInTheDocument();
    expect(ranked("explore-review-row")).toEqual([]);
    expect(ranked("explore-strong-row")).toEqual(["A1 1", "B1 1"]);
  });

  it("counts a seat's pairs with the other targets on the ring when pointed at", () => {
    sized(() => {
      renderLens({ group: "globe" });
      fireEvent.keyDown(screen.getByRole("application"), { key: "ArrowRight" });
      // A1: strong alignments with B5, C1 and C3 on the ring (six with every target).
      expect(document.querySelector(".ex-tip")?.textContent).toContain("No potential misalignment, 3 strong alignments");
    });
  });

  it("bars each policy area by its pairs with the other targets on the ring", () => {
    renderLens({ group: "globe" });
    const bar = (name: string) =>
      [
        ...screen
          .getAllByTestId("explore-browse-row")
          .find((row) => row.textContent?.includes(name))!
          .querySelectorAll(".brief-pair-value"),
      ].map((v) => v.textContent);
    // Agriculture (B4-B6) with A1-A3 and C1-C3: 9 aligned, 6 partially
    // aligned, 3 potential misalignment (with every target, 12 of each).
    expect(bar("Agriculture")).toEqual(["17%", "50%"]);
    // Human rights has one area: no other targets on the ring, no bar.
    fireEvent.click(screen.getByRole("button", { name: "Human rights" }));
    expect(bar("Right to water")).toEqual([]);
  });

  it("offers human rights with its draft note", () => {
    renderLens();
    const hr = screen.getByRole("button", { name: "Human rights" });
    expect(hr.getAttribute("title")).toMatch(/Draft under expert review/);
    fireEvent.click(hr);
    expect(screen.getByRole("application", { name: /^2 targets on a ring, grouped by Human rights/ })).toBeInTheDocument();
    expect(screen.getByText("2 of the 18 targets fall in one of these areas.")).toBeInTheDocument();
  });

  it("puts a target outside every area in the centre, read against the targets the lens seats", () => {
    renderLens({ group: "hr", focus: "A1" });
    expect(within(side()).getByText(/Aligned with 12 of the 12 targets it was compared with\./)).toBeInTheDocument();
    expect(screen.getByRole("application", { name: /^2 targets on a ring, grouped by Human rights/ })).toBeInTheDocument();
  });
});

describe("Explore: a dot opens what links it to the centre", () => {
  // Lay the ring out: jsdom has no sizes.
  let sizes: { mockRestore: () => void }[] = [];
  beforeEach(() => {
    sizes = [
      vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800),
      vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600),
    ];
  });
  afterEach(() => sizes.forEach((s) => s.mockRestore()));

  /** Where a target's dot sits with `focus` in the centre: the same arcs,
   *  sorted against the centre, laid out at the ring's size (the fixture's
   *  short names leave the least room for them, 56px + 16px). */
  function dot(focus: string | null, id: string) {
    const model = buildExploreModel(DATA.scope, null);
    const members = focus ? focusMembers(model, parseFocusKey(focus), SOURCE.lenses) : [];
    const profile = members.length > 0 ? groupProfile(model, members) : null;
    const arcs = groupByDocument(model, DATA.scope.docs).map((g) => ({
      ...g,
      ids: profile ? groupSeatOrder(g.ids, profile) : g.ids,
    }));
    const layout = layoutRing(arcs, model.items.length, 800, 600, { labelHeight: 72 });
    const i = model.index.get(id)!;
    return { clientX: layout.x[i], clientY: layout.y[i] };
  }
  const card = () => document.querySelector(".ex-tip")?.textContent ?? "";

  it("opens the comparison with the target in the centre, and puts the dot in the centre when selected again", async () => {
    renderExplore({ focus: "B6" });
    const ring = screen.getByRole("application");
    const a6 = dot("B6", "A6");
    fireEvent.pointerMove(ring, a6);
    expect(card()).toContain("Select to open the comparison");
    fireEvent.click(ring, a6);
    expect(await screen.findByTestId("explore-pair")).toBeInTheDocument();
    // B6 stays in the centre.
    expect(within(side()).getByText(/Potential misalignment with 7\./)).toBeInTheDocument();
    expect(card()).toContain("Select again to put it in the centre");
    fireEvent.click(ring, a6);
    // A6 is now in the centre: potential misalignment with all six B targets.
    expect(within(side()).getByText(/Potential misalignment with 6\./)).toBeInTheDocument();
    expect(screen.queryByTestId("explore-pair")).toBeNull();
  });

  it("keeps Enter for putting a seat in the centre at once", () => {
    renderExplore({ focus: "B6" });
    const ring = screen.getByRole("application");
    ring.focus();
    // The first seat of A, sorted against B6, is A6.
    fireEvent.keyDown(ring, { key: "ArrowRight" });
    fireEvent.keyDown(ring, { key: "Enter" });
    expect(within(side()).getByText(/Potential misalignment with 6\./)).toBeInTheDocument();
    expect(screen.queryByTestId("explore-pair")).toBeNull();
  });

  it("puts a dot of the centre's own document in the centre at once", () => {
    renderExplore({ focus: "B6" });
    fireEvent.click(screen.getByRole("application"), dot("B6", "B5"));
    // B5: potential misalignment with A6 and C4-C6.
    expect(within(side()).getByText(/Potential misalignment with 4\./)).toBeInTheDocument();
    expect(screen.queryByTestId("explore-pair")).toBeNull();
  });

  it("puts a dot in the centre at once while nothing is there", () => {
    renderExplore();
    fireEvent.click(screen.getByRole("application"), dot(null, "A6"));
    expect(within(side()).getByText(/Potential misalignment with 6\./)).toBeInTheDocument();
  });

  it("with a document in the centre, opens a dot's target pairs with it, then puts the dot in the centre", () => {
    renderExplore({ focus: "doc:A" });
    const ring = screen.getByRole("application");
    const b1 = dot("doc:A", "B1");
    fireEvent.pointerMove(ring, b1);
    expect(card()).toContain("Select to open its target pairs");
    fireEvent.click(ring, b1);
    // B1 with each of A1-A6.
    expect(within(screen.getByTestId("explore-seat-pairs")).getByText(/6 target pairs/)).toBeInTheDocument();
    expect(card()).toContain("Select again to put it in the centre");
    fireEvent.click(ring, b1);
    // B1 in the centre: its one potential misalignment is with A6.
    expect(within(side()).getByText(/Potential misalignment with 1\./)).toBeInTheDocument();
  });
});

describe("Explore: the centre's bar in words", () => {
  const card = () => document.querySelector(".ex-centre-card") as HTMLElement;
  const key = () => [...card().querySelectorAll(".ex-key li")].map((li) => li.textContent);

  it("says what a target's bar counts, and names its colours with their shares", () => {
    // B6: 12 target pairs, 4 aligned, 1 partially aligned, 7 potential misalignment.
    renderExplore({ focus: "B6" });
    expect(within(card()).getByText("12 target pairs with the other documents")).toBeInTheDocument();
    expect(key()).toEqual(["33% aligned", "8% partially aligned", "58% potential misalignment"]);
  });

  it("names the colours of a document's bar as well", () => {
    // B: 72 target pairs, 42 aligned, 15 partially aligned, 15 potential misalignment.
    renderExplore({ focus: "doc:B" });
    expect(key()).toEqual(["58% aligned", "21% partially aligned", "21% potential misalignment"]);
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

  it("puts a reported action in the centre with the targets it serves and those potentially misaligned with it", () => {
    renderLayered({ focus: "BTR_1" });
    expect(within(side()).getByText(/Reported mitigation action · Biennial Transparency Report \(BTR\)/)).toBeInTheDocument();
    expect(within(side()).getByText("Strongly aligned with 1 target. Potentially misaligned with 1 target.")).toBeInTheDocument();
    expect(within(side()).getByRole("heading", { name: "Potentially misaligned targets (1)" })).toBeInTheDocument();
    expect(screen.getAllByTestId("explore-item-strong")).toHaveLength(1);
    expect(screen.getAllByTestId("explore-item-pull")).toHaveLength(1);
  });

  it("says in the agreed words when a reported action is potentially misaligned with the target in the centre", () => {
    renderLayered({ focus: "B2", layers: ["mitigation", "adaptation"] });
    expect(within(side()).getByText("No strongly aligned reported action. 1 potentially misaligned.")).toBeInTheDocument();
    expect(screen.getAllByTestId("explore-action-pull")).toHaveLength(1);
  });


  it("counts the targets potentially misaligned with a reported action when the actions are in the centre", () => {
    renderLayered({ focus: "doc:layer:mitigation", layers: ["mitigation"] });
    expect(
      within(side()).getByText(
        "1 of 18 targets have a strongly aligned reported action. 1 target is potentially misaligned with a reported action.",
      ),
    ).toBeInTheDocument();
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

describe("a budget line named in translation", () => {
  const OWN = "Fort Gest. Eco. y Admón. Finan.";
  const PANAMA = {
    budgetPseudoTargets: [
      { id: "BER_BER_PA_10_01", sourceLabel: `BER_PA_10_01 ${OWN}`, text: `${OWN}. (LLM-generated)`, expenditure: { "2024": 1 } },
    ],
    budgetAlignment: [{ targetAId: "A2", targetBId: "BER_BER_PA_10_01", alignment: "high" }],
    berData: {
      currency: "PAB",
      unit: "million",
      period: { start: 2015, end: 2024 },
      programs: [
        {
          code: "BER_PA_10_01",
          name: OWN,
          description: OWN,
          descriptionEn: `Programme "${OWN}" under the Ministry of Economy and Finance.`,
          descriptionAiGenerated: true,
        },
      ],
    },
  };
  const NAMES = { names: { BER_PA_10_01: { en: "Strengthening economic management and financial administration" } } };

  function renderLine() {
    const layers = buildExploreLayers(PANAMA, SOURCE, { locale: "en", names: NAMES })!;
    function View() {
      const [state, dispatch] = useReducer(exploreReducer, {
        ...initialExploreState(),
        focus: "BER_BER_PA_10_01",
        layers: ["budget"],
      });
      return <Explore source={SOURCE} data={DATA} state={state} dispatch={dispatch} groups={["docs"]} layers={layers} />;
    }
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <View />
      </NextIntlClientProvider>,
    );
  }

  it("is marked as a machine translation, with the review's own name on hover", () => {
    renderLine();
    const title = within(side()).getByRole("heading", { level: 2 });
    expect(title).toHaveTextContent("Strengthening economic management and financial administration");
    expect(within(title).getByText("machine translation")).toHaveAttribute("title", `In the review: ${OWN}`);
  });

  it("labels the review's description as written with AI", () => {
    renderLine();
    const label = within(side()).getByText("AI-generated:");
    expect(label).toHaveAttribute("title", "Written with AI for the review's table of descriptions");
    expect(label.closest("p")).toHaveTextContent(
      `AI-generated: Programme "${OWN}" under the Ministry of Economy and Finance.`,
    );
  });
});
