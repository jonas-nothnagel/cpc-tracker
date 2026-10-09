import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import { layoutAreaField, type AreaFieldRow } from "@/lib/brief/area-layout";
import { DEFAULT_AREA_SORT, areaTones, orderRows, sortAreas } from "@/lib/brief/area-shares";
import { areaFocus, cloudSizes, lensAreas, restClouds, rowOrder, sideLinks, type LensAreas } from "@/lib/brief/areas";
import { scopeOf, type Scope } from "@/lib/brief/compute";
import { buildBriefData } from "@/lib/brief/data";
import type { BriefSource, LensId } from "@/lib/brief/source";
import { briefFixture } from "@/lib/brief/test-fixture";
import { AreasView } from "./areas-view";

const BASE = briefFixture();
// A second lens, so the choice has two options.
const SOURCE: BriefSource = {
  ...BASE,
  lenses: [
    ...BASE.lenses,
    {
      id: "ipcc",
      taxonomyType: "sector",
      categories: [{ id: "s1", name: "Land use, land-use change and forestry (LULUCF)" }],
      primary: { A1: "s1" },
    },
    { id: "hr", taxonomyType: "hr", categories: [{ id: "h1", name: "Gender equality" }], primary: { B6: "h1" } },
  ],
};
const DATA = buildBriefData(SOURCE, scopeOf(SOURCE, ["A", "B", "C"]), "globe");
const W = 640;

const saved = {
  w: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth"),
  ctx: HTMLCanvasElement.prototype.getContext,
};

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => W });
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
});

afterEach(() => {
  cleanup();
  if (saved.w) Object.defineProperty(HTMLElement.prototype, "clientWidth", saved.w);
  HTMLCanvasElement.prototype.getContext = saved.ctx;
});

type Props = Parameters<typeof AreasView>[0];

function renderView(props: Partial<Props> = {}) {
  const handlers = { onLens: vi.fn(), onExplore: vi.fn(), onOpenAreaPair: vi.fn() };
  const view = (over: Partial<Props>) => (
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <AreasView source={SOURCE} data={DATA} lens={"globe" as LensId} {...handlers} {...props} {...over} />
    </NextIntlClientProvider>
  );
  const utils = render(view({}));
  return { ...handlers, rerender: (over: Partial<Props>) => utils.rerender(view(over)) };
}

/** The picture's rows as the view draws them: in the order of the default sort. */
const drawnRows = (lens: LensAreas, scope: Scope, rows: AreaFieldRow[]) =>
  orderRows(rows, sortAreas(lens, areaTones(lens, scope), DEFAULT_AREA_SORT));
const pairRows = () => screen.getAllByTestId("brief-area-pair");
const pairNames = () => pairRows().map((p) => p.querySelector(".brief-av-pair-name")?.textContent);
const row = (id: string) => document.querySelector(`[data-row="${id}"]`) as HTMLElement;
const openSecond = () => fireEvent.click(within(pairRows()[1]).getByRole("button", { expanded: false }));
/** An area's name on the picture, which picks the area. */
const areaName = (id: string, name: string) => within(row(id)).getByRole("button", { name });
const headline = () => screen.getByRole("heading", { level: 2 }).textContent;
/** The way back from a picked area to all pairs of areas. */
const backAll = () => screen.queryByRole("button", { name: "Back to All pairs of areas" });

describe("AreasView", () => {
  it("leads with where the side's target pairs sit, as a number", () => {
    renderView();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "60% of the potential misalignments sit between Agriculture targets and targets outside these areas.",
    );
    expect(screen.getByText("9 of the 18 targets fall in one of these areas.")).toBeTruthy();
  });

  it("lists the pairs of areas that hold the most, the rest summed", () => {
    renderView();
    const [first, second] = pairRows();
    expect(within(first).getByText("Agriculture · targets outside these areas")).toBeTruthy();
    expect(first.querySelector(".brief-av-pair-count")?.textContent).toBe("9");
    expect(within(first).getByText("50% of 18 target pairs")).toBeTruthy();
    expect(within(second).getByText("Agriculture · Water")).toBeTruthy();
    expect(within(second).getByText("33% of 9 target pairs")).toBeTruthy();
    expect(screen.getByText("The other 4 pairs of areas: 0 of their 54 target pairs.")).toBeTruthy();
  });

  it("marks a pair of areas' rows when pointed at, and changes nothing else", () => {
    renderView();
    const head = within(pairRows()[1]).getByRole("button");
    fireEvent.pointerEnter(head);
    expect(row("g2").getAttribute("data-marked")).toBe("true");
    expect(row("g5").getAttribute("data-marked")).toBe("true");
    expect(row("g1").getAttribute("data-marked")).toBeNull();
    expect(document.querySelectorAll(".brief-av-of")).toHaveLength(0);
    fireEvent.pointerLeave(head);
    expect(row("g2").getAttribute("data-marked")).toBeNull();
  });

  it("opens a pair of areas: its two rows marked, its count left to the list, its most involved targets listed", () => {
    const { onOpenAreaPair } = renderView();
    openSecond();
    expect(row("g2").getAttribute("data-marked")).toBe("true");
    expect(row("g5").getAttribute("data-marked")).toBe("true");
    expect(document.querySelectorAll(".brief-av-of")).toHaveLength(0);
    expect(row("g1").getAttribute("data-dim")).toBe("true");
    expect(screen.getByText("Agriculture targets most involved")).toBeTruthy();
    expect(screen.getByText("Water targets most involved")).toBeTruthy();
    const counts = screen.getAllByTestId("brief-area-target").map((t) => t.querySelector(".brief-av-target-count")?.textContent);
    expect(counts).toEqual(["3", "1", "1", "1"]);
    fireEvent.click(screen.getByRole("button", { name: "See the 3 target pairs" }));
    expect(onOpenAreaPair).toHaveBeenCalledWith({ lens: "globe", key: "g2|g5", side: "apart" });
  });

  it("picks a target from an open pair: its partners counted in every row, the target shown, back to the pair", () => {
    const { onExplore } = renderView();
    openSecond();
    const c1 = screen.getAllByTestId("brief-area-target").find((t) => t.textContent?.includes("Commitment C1"))!;
    fireEvent.click(c1);
    const card = screen.getByTestId("brief-area-card");
    expect(within(card).getByText("1 Commitment C1")).toBeTruthy();
    expect(within(card).getByText("Document C")).toBeTruthy();
    expect(card.textContent).toContain("Potential misalignment with 1 target: 1 in Agriculture.");
    expect(row("g2").querySelector(".brief-av-of")?.textContent).toBe("1 potential misalignment");
    fireEvent.click(within(card).getByRole("button", { name: "Explore this target" }));
    expect(onExplore).toHaveBeenCalledWith("C1");
    fireEvent.click(within(card).getByRole("button", { name: "Back to Agriculture · Water" }));
    expect(screen.queryByTestId("brief-area-card")).toBeNull();
    expect(screen.getAllByTestId("brief-area-target")).toHaveLength(4);
  });

  it("picks a target on the picture, and lets it go on a second pick at the same spot", () => {
    renderView();
    const lens = lensAreas(SOURCE, DATA.scope, "globe");
    const links = sideLinks(DATA.scope);
    const rest = restClouds(lens, links, "apart");
    const at = layoutAreaField(drawnRows(lens, DATA.scope, rowOrder(lens, rest, rest, { kind: "rest" }, links, "apart")), rest, W).at;
    const field = document.querySelector(".brief-av-field") as HTMLElement;
    const b6 = at.get("B6")!;
    fireEvent.click(field, { clientX: b6.x, clientY: b6.y });
    const card = screen.getByTestId("brief-area-card");
    expect(within(card).getByText("6 Commitment B6")).toBeTruthy();
    expect(card.textContent).toContain("Potential misalignment with 7 targets: 3 in Water, 4 outside these areas.");
    expect(row("g5").querySelector(".brief-av-of")?.textContent).toBe("3 potential misalignments");
    fireEvent.click(field, { clientX: b6.x, clientY: b6.y });
    expect(screen.queryByTestId("brief-area-card")).toBeNull();
    // B5 stands second in its row: picked, it stays there, so the same spot lets it go.
    const b5 = at.get("B5")!;
    fireEvent.click(field, { clientX: b5.x, clientY: b5.y });
    expect(within(screen.getByTestId("brief-area-card")).getByText("5 Commitment B5")).toBeTruthy();
    fireEvent.click(field, { clientX: b5.x, clientY: b5.y });
    expect(screen.queryByTestId("brief-area-card")).toBeNull();
  });

  it("takes keyboard focus to a picked target, and back to its pair of areas", () => {
    renderView();
    openSecond();
    const c1 = screen.getAllByTestId("brief-area-target").find((t) => t.textContent?.includes("Commitment C1"))!;
    fireEvent.click(c1);
    const card = screen.getByTestId("brief-area-card");
    expect(document.activeElement?.textContent).toBe("1 Commitment C1");
    expect(card.contains(document.activeElement)).toBe(true);
    fireEvent.click(within(card).getByRole("button", { name: "Back to Agriculture · Water" }));
    expect(document.activeElement).toBe(within(pairRows()[1]).getByRole("button", { expanded: true }));
  });

  it("leaves focus where the pointer picked a target, still bringing its card into view", () => {
    const seen: Element[] = [];
    Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
      seen.push(this);
    });
    renderView();
    openSecond();
    const c1 = screen.getAllByTestId("brief-area-target").find((t) => t.textContent?.includes("Commitment C1"))!;
    fireEvent.click(c1, { detail: 1 });
    const card = screen.getByTestId("brief-area-card");
    expect(card.contains(document.activeElement)).toBe(false);
    expect(seen.some((el) => card.contains(el))).toBe(true);
    fireEvent.click(within(card).getByRole("button", { name: "Back to Agriculture · Water" }), { detail: 1 });
    expect(document.activeElement).not.toBe(within(pairRows()[1]).getByRole("button", { expanded: true }));
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it("points from the headline's area names to their rows, and opens their pair", () => {
    renderView();
    const name = within(screen.getByRole("heading", { level: 2 })).getByRole("button", { name: "Agriculture" });
    fireEvent.pointerEnter(name);
    expect(row("g2").getAttribute("data-marked")).toBe("true");
    fireEvent.click(name);
    expect(within(pairRows()[0]).getByRole("button", { expanded: true })).toBeTruthy();
  });

  it("reads strong alignments on request, letting the open pair go", () => {
    renderView();
    openSecond();
    fireEvent.click(screen.getByRole("button", { name: "Strong alignment" }));
    expect(screen.getByRole("button", { name: "Strong alignment" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "28% of the strong alignments sit between Water targets and targets outside these areas.",
    );
    expect(within(pairRows()[0]).getByText("56% of 18 target pairs")).toBeTruthy();
    expect(screen.queryByTestId("brief-area-target")).toBeNull();
  });

  it("offers the lens as a plain choice, the brief's own", () => {
    const { onLens } = renderView();
    expect(screen.getByRole("button", { name: "Biodiversity" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Climate mitigation" }));
    expect(onLens).toHaveBeenCalledWith("ipcc");
  });

  it("lets an open pair of areas go when the lens changes, for good", () => {
    const { rerender } = renderView();
    openSecond();
    rerender({ lens: "ipcc" });
    expect(screen.queryByTestId("brief-area-target")).toBeNull();
    rerender({ lens: "globe" });
    expect(screen.queryByTestId("brief-area-target")).toBeNull();
  });

  it("says so when no target pair in these areas is on the side, with nothing else listed", () => {
    renderView({ data: buildBriefData(SOURCE, scopeOf(SOURCE, ["A", "C"]), "globe") });
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "No target pairs in these policy areas show potential misalignment.",
    );
    expect(screen.queryAllByTestId("brief-area-pair")).toHaveLength(0);
    expect(document.querySelector(".brief-av-rest")).toBeNull();
  });

  it("says where the side's other target pairs are when both of their targets sit outside the lens", () => {
    renderView();
    expect(screen.getByText("3 potential misalignments fall between targets outside these areas.")).toBeTruthy();
  });

  it("gives the lens choices the menu's explanations", () => {
    renderView();
    expect(screen.getByRole("button", { name: "Human rights" }).getAttribute("title")).toBe(en.briefing.lens.hrTooltip);
    expect(screen.getByRole("button", { name: "Biodiversity" }).getAttribute("title")).toBeNull();
  });

  it("names each area in full on request, its acronym included", () => {
    renderView();
    expect(row("g1").querySelector(".brief-av-name")?.getAttribute("title")).toBe("Protected areas");
    cleanup();
    renderView({ lens: "ipcc" });
    const name = row("s1").querySelector(".brief-av-name")!;
    expect(name.textContent).toBe("Land use, land-use change and forestry");
    expect(name.getAttribute("title")).toBe("Land use, land-use change and forestry (LULUCF)");
  });

  it("reads each row to screen readers with its number of targets", () => {
    renderView();
    const list = screen.getByRole("list", { name: "Policy areas" });
    expect(within(list).getAllByRole("listitem")[0].textContent).toContain("3 targets");
  });

  it("heads the most involved targets one level under the headline", () => {
    renderView();
    openSecond();
    expect(screen.getByRole("heading", { level: 3, name: "Agriculture targets most involved" })).toBeTruthy();
  });

  it("brings an opened pair of areas and a picked target into view", () => {
    const seen: Element[] = [];
    Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
      seen.push(this);
    });
    renderView();
    openSecond();
    expect(seen.some((el) => el.closest("[data-open]") === pairRows()[1])).toBe(true);
    seen.length = 0;
    const c1 = screen.getAllByTestId("brief-area-target").find((t) => t.textContent?.includes("Commitment C1"))!;
    fireEvent.click(c1);
    expect(seen.some((el) => screen.getByTestId("brief-area-card").contains(el))).toBe(true);
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it("ends a picked target's partners with a count, not an ellipsis, when they spread wider", () => {
    // B6's seven partners: one each in six areas, and C6 outside the lens.
    const categories = [1, 2, 3, 4, 5, 6, 7].map((i) => ({ id: `z${i}`, name: `Area ${i}` }));
    const spread: BriefSource = {
      ...BASE,
      lenses: [
        {
          ...BASE.lenses[0],
          categories,
          primary: { A6: "z1", C1: "z2", C2: "z3", C3: "z4", C4: "z5", C5: "z6", B6: "z7" },
        },
      ],
    };
    const data = buildBriefData(spread, scopeOf(spread, ["A", "B", "C"]), "globe");
    renderView({ source: spread, data });
    const lens = lensAreas(spread, data.scope, "globe");
    const links = sideLinks(data.scope);
    const rest = restClouds(lens, links, "apart");
    const rows = drawnRows(lens, data.scope, rowOrder(lens, rest, rest, { kind: "rest" }, links, "apart"));
    const b6 = layoutAreaField(rows, rest, W).at.get("B6")!;
    fireEvent.click(document.querySelector(".brief-av-field") as HTMLElement, { clientX: b6.x, clientY: b6.y });
    expect(screen.getByTestId("brief-area-card").textContent).toContain(
      "Potential misalignment with 7 targets: 1 in Area 1, 1 in Area 2, 1 in Area 3, 4 elsewhere.",
    );
  });

  it("picks an area by its name: named in the headline, its pairs of areas listed, its name marked", () => {
    renderView();
    fireEvent.click(areaName("g5", "Water"));
    expect(areaName("g5", "Water").getAttribute("aria-pressed")).toBe("true");
    expect(row("g5").getAttribute("data-marked")).toBe("true");
    expect(headline()).toBe("20% of the potential misalignments involve Water targets.");
    expect(pairNames()).toEqual(["Agriculture · Water"]);
    expect(screen.getByText("The other 2 pairs of areas: 0 of their 27 target pairs.")).toBeTruthy();
    expect(screen.queryByText("3 potential misalignments fall between targets outside these areas.")).toBeNull();
    expect(row("g1").getAttribute("data-dim")).toBe("true");
    expect(row("g2").getAttribute("data-dim")).toBeNull();
  });

  it("counts beside each row a picked area's target pairs there, as the list does, and all of them in its own row", () => {
    renderView();
    fireEvent.click(areaName("g2", "Agriculture"));
    expect(headline()).toBe("80% of the potential misalignments involve Agriculture targets.");
    const listed = pairRows().map((p) => [
      p.querySelector(".brief-av-pair-name")?.textContent,
      p.querySelector(".brief-av-pair-count")?.textContent,
    ]);
    expect(listed).toEqual([
      ["Agriculture · targets outside these areas", "9"],
      ["Agriculture · Water", "3"],
    ]);
    expect(row("g5").querySelector(".brief-av-of")?.textContent).toBe("3 potential misalignments");
    expect(row("g2").querySelector(".brief-av-of")?.textContent).toBe("12 potential misalignments");
    expect(row("g1").querySelector(".brief-av-of")).toBeNull();
  });

  it("says so when none of the side's target pairs involves a picked area", () => {
    renderView();
    fireEvent.click(areaName("g1", "Protected areas"));
    expect(headline()).toBe("No potential misalignments involve Protected areas targets.");
    expect(screen.queryAllByTestId("brief-area-pair")).toHaveLength(0);
    expect(row("g1").querySelector(".brief-av-of")?.textContent).toBe("0 potential misalignments");
  });

  it("goes back to all pairs of areas from a picked area, or on a second pick of its name", () => {
    renderView();
    fireEvent.click(areaName("g5", "Water"));
    fireEvent.click(backAll()!);
    expect(backAll()).toBeNull();
    expect(headline()).toBe(
      "60% of the potential misalignments sit between Agriculture targets and targets outside these areas.",
    );
    expect(pairNames()).toEqual(["Agriculture · targets outside these areas", "Agriculture · Water"]);
    expect(row("g5").getAttribute("data-marked")).toBeNull();
    fireEvent.click(areaName("g5", "Water"));
    fireEvent.click(areaName("g5", "Water"));
    expect(backAll()).toBeNull();
    expect(areaName("g5", "Water").getAttribute("aria-pressed")).toBe("false");
  });

  it("picks an area from the keyboard, focus following to the headline that names it, and back to the list", () => {
    renderView();
    fireEvent.keyDown(areaName("g5", "Water"), { key: "Enter" });
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2 }));
    expect(headline()).toBe("20% of the potential misalignments involve Water targets.");
    fireEvent.click(backAll()!);
    expect(document.activeElement).toBe(pairRows()[0].querySelector(".brief-av-pair-head"));
  });

  it("takes keyboard focus to the headline when a picked area's name closes its open pair", () => {
    renderView();
    fireEvent.click(areaName("g5", "Water"), { detail: 1 });
    fireEvent.click(within(pairRows()[0]).getByRole("button", { expanded: false }));
    fireEvent.keyDown(areaName("g5", "Water"), { key: "Enter" });
    expect(screen.queryByText("Water targets most involved")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2 }));
  });

  it("leaves focus where the pointer picked an area", () => {
    renderView();
    fireEvent.click(areaName("g5", "Water"), { detail: 1 });
    expect(headline()).toBe("20% of the potential misalignments involve Water targets.");
    expect(document.activeElement).not.toBe(screen.getByRole("heading", { level: 2 }));
    fireEvent.click(backAll()!, { detail: 1 });
    expect(document.activeElement).not.toBe(pairRows()[0].querySelector(".brief-av-pair-head"));
  });

  it("marks an area's name when pointed at, and changes nothing else", () => {
    renderView();
    const name = areaName("g1", "Protected areas");
    fireEvent.pointerEnter(name);
    expect(row("g1").getAttribute("data-marked")).toBe("true");
    expect(backAll()).toBeNull();
    expect(headline()).toContain("sit between Agriculture targets");
    fireEvent.pointerLeave(name);
    expect(row("g1").getAttribute("data-marked")).toBeNull();
  });

  it("opens a pair of areas from a picked area's list: its two rows marked, the headline kept", () => {
    renderView();
    fireEvent.click(areaName("g5", "Water"));
    fireEvent.click(within(pairRows()[0]).getByRole("button", { expanded: false }));
    expect(row("g2").getAttribute("data-marked")).toBe("true");
    expect(row("g5").getAttribute("data-marked")).toBe("true");
    expect(screen.getByText("Water targets most involved")).toBeTruthy();
    expect(headline()).toBe("20% of the potential misalignments involve Water targets.");
    expect(document.querySelectorAll(".brief-av-of")).toHaveLength(0);
  });

  it("returns to a picked area from its open pair on a pick of its name, and only then lets it go", () => {
    renderView();
    fireEvent.click(areaName("g5", "Water"));
    fireEvent.click(within(pairRows()[0]).getByRole("button", { expanded: false }));
    fireEvent.click(areaName("g5", "Water"));
    expect(backAll()).toBeTruthy();
    expect(screen.queryByText("Water targets most involved")).toBeNull();
    expect(row("g2").getAttribute("data-marked")).toBeNull();
    fireEvent.click(areaName("g5", "Water"));
    expect(backAll()).toBeNull();
  });

  it("goes back to the picked area from a target picked on the picture", () => {
    renderView();
    fireEvent.click(areaName("g5", "Water"));
    const lens = lensAreas(SOURCE, DATA.scope, "globe");
    const links = sideLinks(DATA.scope);
    const rest = restClouds(lens, links, "apart");
    const around = areaFocus(lens, links, "apart", "g5");
    const rows = rowOrder(lens, rest, cloudSizes(lens, links, "apart", around), around, links, "apart");
    const b6 = layoutAreaField(drawnRows(lens, DATA.scope, rows), rest, W).at.get("B6")!;
    fireEvent.click(document.querySelector(".brief-av-field") as HTMLElement, { clientX: b6.x, clientY: b6.y });
    const card = screen.getByTestId("brief-area-card");
    expect(within(card).getByText("6 Commitment B6")).toBeTruthy();
    expect(backAll()).toBeNull();
    fireEvent.click(within(card).getByRole("button", { name: "Back to Water" }));
    expect(screen.queryByTestId("brief-area-card")).toBeNull();
    expect(backAll()).toBeTruthy();
    expect(pairNames()).toEqual(["Agriculture · Water"]);
  });

  it("keeps a picked area on the other side", () => {
    renderView();
    fireEvent.click(areaName("g5", "Water"));
    fireEvent.click(screen.getByRole("button", { name: "Strong alignment" }));
    expect(headline()).toBe("44% of the strong alignments involve Water targets.");
    expect(pairNames()).toEqual(["Water · targets outside these areas", "Protected areas · Water"]);
  });

  it("lets a picked area go when the lens changes, for good", () => {
    const { rerender } = renderView();
    fireEvent.click(areaName("g5", "Water"));
    rerender({ lens: "ipcc" });
    expect(backAll()).toBeNull();
    rerender({ lens: "globe" });
    expect(backAll()).toBeNull();
    expect(headline()).toContain("sit between Agriculture targets");
  });

  it("lets a picked target go when the lens changes, for good", () => {
    const { rerender } = renderView();
    openSecond();
    fireEvent.click(screen.getAllByTestId("brief-area-target")[0]);
    expect(screen.getByTestId("brief-area-card")).toBeTruthy();
    rerender({ lens: "ipcc" });
    expect(screen.queryByTestId("brief-area-card")).toBeNull();
    rerender({ lens: "globe" });
    expect(screen.queryByTestId("brief-area-card")).toBeNull();
  });
});

// The lens named top left, each area's result bar on its row, every column
// sorting the rows. Protected areas (g1) is 100% aligned, Water (g5) 67% /
// 25% / 8%, Agriculture (g2) 33% / 33% / 33%.
describe("AreasView figures", () => {
  const rowIds = () => [...document.querySelectorAll("[data-row]")].map((el) => el.getAttribute("data-row"));
  const head = () => document.querySelector(".brief-av-head") as HTMLElement;
  const sortBy = (name: string) => fireEvent.click(within(head()).getByRole("button", { name }));
  const ends = (id: string) => [...row(id).querySelectorAll(".brief-pair-value")].map((el) => el.textContent);

  it("names the lens top left and opens with the most aligned areas", () => {
    renderView();
    expect(head().querySelector(".brief-av-lens")?.textContent).toBe("Biodiversity");
    expect(rowIds()).toEqual(["g1", "g5", "g2"]);
    expect(within(head()).getByRole("button", { name: "Aligned, most first" })).toBeTruthy();
  });

  it("gives each row its targets and the result bar of all its target pairs", () => {
    renderView();
    expect(row("g5").querySelector(".brief-av-fig")?.textContent).toBe("3");
    expect(ends("g5")).toEqual(["8%", "67%"]);
    expect(ends("g2")).toEqual(["33%", "33%"]);
    expect(
      within(row("g5")).getByText("67% aligned, 25% partially aligned, 8% potential misalignment, of 36 target pairs"),
    ).toBeTruthy();
  });

  it("sorts a column most first, then least first", () => {
    renderView();
    sortBy("Potential misalignment");
    expect(rowIds()).toEqual(["g2", "g5", "g1"]);
    sortBy("Potential misalignment, most first");
    expect(rowIds()).toEqual(["g1", "g5", "g2"]);
    expect(within(head()).getByRole("button", { name: "Potential misalignment, least first" })).toBeTruthy();
    sortBy("Aligned");
    expect(rowIds()).toEqual(["g1", "g5", "g2"]);
    sortBy("Aligned, most first");
    expect(rowIds()).toEqual(["g2", "g5", "g1"]);
    sortBy("Targets");
    expect(rowIds()).toEqual(["g1", "g2", "g5"]);
  });

  it("marks an area with few targets and leaves one with too few target pairs unrated", () => {
    renderView({ lens: "ipcc" as LensId });
    expect(head().querySelector(".brief-av-lens")?.textContent).toBe("Climate mitigation");
    expect(within(row("s1")).getByText("few targets")).toBeTruthy();
    expect(row("s1").querySelector(".brief-av-bar")?.textContent).toBe("—");
  });

  it("keeps the sort while an area is picked by its name", () => {
    renderView();
    sortBy("Potential misalignment");
    fireEvent.click(areaName("g5", "Water"));
    expect(backAll()).toBeTruthy();
    expect(rowIds()).toEqual(["g2", "g5", "g1"]);
  });
});
