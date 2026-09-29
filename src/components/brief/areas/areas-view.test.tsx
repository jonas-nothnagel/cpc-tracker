import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import { layoutAreaField } from "@/lib/brief/area-layout";
import { lensAreas, restClouds, rowOrder, sideLinks } from "@/lib/brief/areas";
import { scopeOf } from "@/lib/brief/compute";
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

const pairRows = () => screen.getAllByTestId("brief-area-pair");
const row = (id: string) => document.querySelector(`[data-row="${id}"]`) as HTMLElement;
const openSecond = () => fireEvent.click(within(pairRows()[1]).getByRole("button", { expanded: false }));

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

  it("opens a pair of areas: its rows count the targets taking part, its most involved targets listed", () => {
    const { onOpenAreaPair } = renderView();
    openSecond();
    expect(row("g2").textContent).toContain("1 of 3 targets");
    expect(row("g5").textContent).toContain("3 of 3 targets");
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
    expect(row("g2").textContent).toContain("1 of 3 targets");
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
    const at = layoutAreaField(rowOrder(lens, rest, rest, { kind: "rest" }, links, "apart"), rest, W).at;
    const field = document.querySelector(".brief-av-field") as HTMLElement;
    const b6 = at.get("B6")!;
    fireEvent.click(field, { clientX: b6.x, clientY: b6.y });
    const card = screen.getByTestId("brief-area-card");
    expect(within(card).getByText("6 Commitment B6")).toBeTruthy();
    expect(card.textContent).toContain("Potential misalignment with 7 targets: 3 in Water, 4 outside these areas.");
    expect(row("g5").textContent).toContain("3 of 3 targets");
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
    fireEvent.click(screen.getByRole("button", { name: "Mitigation sectors" }));
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
    const b6 = layoutAreaField(rowOrder(lens, rest, rest, { kind: "rest" }, links, "apart"), rest, W).at.get("B6")!;
    fireEvent.click(document.querySelector(".brief-av-field") as HTMLElement, { clientX: b6.x, clientY: b6.y });
    expect(screen.getByTestId("brief-area-card").textContent).toContain(
      "Potential misalignment with 7 targets: 1 in Area 1, 1 in Area 2, 1 in Area 3, 4 elsewhere.",
    );
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
