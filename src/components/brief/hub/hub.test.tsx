import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import es from "../../../../messages/es.json";
import { buildBriefData } from "@/lib/brief/data";
import { scopeOf } from "@/lib/brief/compute";
import { briefFixture } from "@/lib/brief/test-fixture";
import { hubParticles, layoutHub } from "@/lib/brief/hub";
import { Hub } from "./hub";

const SOURCE = briefFixture({ themes: true });
const DATA = buildBriefData(SOURCE, scopeOf(SOURCE, ["A", "B", "C"]), null);

// Steps become active as they cross the middle of the window.
const observed: { el: Element; cb: IntersectionObserverCallback }[] = [];
const saved = { io: globalThis.IntersectionObserver, ctx: HTMLCanvasElement.prototype.getContext };

beforeEach(() => {
  observed.length = 0;
  globalThis.IntersectionObserver = class {
    cb: IntersectionObserverCallback;
    constructor(cb: IntersectionObserverCallback) {
      this.cb = cb;
    }
    observe(el: Element) {
      observed.push({ el, cb: this.cb });
    }
    unobserve() {}
    disconnect() {}
  } as never;
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  globalThis.IntersectionObserver = saved.io;
  HTMLCanvasElement.prototype.getContext = saved.ctx;
});

function renderHub(handlers = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <Hub data={DATA} {...handlers} />
    </NextIntlClientProvider>,
  );
}

function enter(step: string) {
  const entry = [...observed].reverse().find((o) => (o.el as HTMLElement).dataset.step === step);
  if (!entry) throw new Error(`no observed step ${step}`);
  act(() => entry.cb([{ target: entry.el, isIntersecting: true } as unknown as IntersectionObserverEntry], {} as IntersectionObserver));
}

function leave(step: string) {
  const entry = [...observed].reverse().find((o) => (o.el as HTMLElement).dataset.step === step);
  if (!entry) throw new Error(`no observed step ${step}`);
  act(() => entry.cb([{ target: entry.el, isIntersecting: false } as unknown as IntersectionObserverEntry], {} as IntersectionObserver));
}

const stage = () => document.querySelector("[data-hub-stage]")?.getAttribute("data-hub-stage");
const step = (name: string) => document.querySelector(`[data-step="${name}"]`) as HTMLElement;

const sizes = {
  w: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth"),
  h: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight"),
};

/** jsdom lays nothing out: give the field a size so its groups exist. */
function withField<T>(run: () => T): T {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 500 });
  try {
    return run();
  } finally {
    if (sizes.w) Object.defineProperty(HTMLElement.prototype, "clientWidth", sizes.w);
    if (sizes.h) Object.defineProperty(HTMLElement.prototype, "clientHeight", sizes.h);
  }
}

const field = () => document.querySelector(".brief-hub-canvas") as HTMLElement;

describe("Hub", () => {
  it("opens on the overall picture; a rating leads to the map, with its pairs brought forward there", () => {
    renderHub();
    expect(
      screen.getByRole("heading", {
        name: "Across Testland's policies, 67% of target pairs are aligned and 14% show potential misalignment.",
      }),
    ).toBeTruthy();
    expect(stage()).toBe("overview");
    fireEvent.click(screen.getByRole("button", { name: "67% aligned" }));
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    expect(scroll.mock.contexts.map((el) => (el as HTMLElement).dataset.step)).toEqual(["map"]);
    enter("map");
    expect(stage()).toBe("map:tone:reinforce");
    // Moving on ends it; coming back shows the whole map.
    enter("reinforce");
    expect(stage()).toBe("map:reinforce:top");
    enter("map");
    expect(stage()).toBe("map");
  });

  it("re-forms the dots for the step in view: the map, each side of it, then a document", () => {
    renderHub();
    enter("map");
    expect(stage()).toBe("map");
    enter("reinforce");
    expect(stage()).toBe("map:reinforce:top");
    enter("apart");
    expect(stage()).toBe("map:apart:top");
    enter("documents");
    expect(stage()).toBe("doc:A");
    expect(document.querySelectorAll("[data-step]")).toHaveLength(5);
  });

  it("after a jump, the step at the middle of the window leads, even one that never left it", () => {
    renderHub();
    enter("map");
    enter("reinforce");
    // The walkthrough brings the map to the middle: the side leaves, while
    // the map's step was in view all along.
    const middle = window.innerHeight / 2;
    step("map").getBoundingClientRect = () => ({ top: middle - 200, bottom: middle + 200 }) as DOMRect;
    step("reinforce").getBoundingClientRect = () => ({ top: middle + 200, bottom: middle + 900 }) as DOMRect;
    leave("reinforce");
    expect(stage()).toBe("map");
  });

  it("names on the map the most closely aligned pair and the pair with the most potential misalignment, as links", () => {
    const onOpenDocPair = vi.fn();
    renderHub({ onOpenDocPair });
    const map = step("map");
    const together = within(map).getByRole("heading");
    expect(together.textContent).toBe("Document A and Document C are the most closely aligned: 83% of their target pairs.");
    fireEvent.click(within(together).getByRole("button", { name: "Document C" }));
    expect(onOpenDocPair).toHaveBeenLastCalledWith("A", "C");
    const apart = within(map).getByTestId("hub-map-apart");
    expect(apart.textContent).toBe(
      "Document B and Document C have the highest share of potential misalignment: 25% of their target pairs.",
    );
    fireEvent.click(within(apart).getByRole("button", { name: "Document B" }));
    expect(onOpenDocPair).toHaveBeenLastCalledWith("B", "C");
  });

  it("what works well: one section, its targets first, then its themes, each brought forward on the map", () => {
    renderHub();
    const aligned = step("reinforce");
    expect(within(aligned).getByRole("heading", { level: 2 }).textContent).toBe(
      "Strong alignments are spread across 12 targets.",
    );
    const firstRow = within(aligned).getAllByTestId("hub-strong-row")[0];
    const theme = within(aligned).getAllByTestId("brief-theme-row")[0];
    expect(firstRow.compareDocumentPosition(theme) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    enter("reinforce");
    fireEvent.pointerEnter(theme);
    expect(stage()).toBe("map:reinforce:theme:0");
    fireEvent.pointerLeave(theme);
    expect(stage()).toBe("map:reinforce:top");
    // From the keyboard too.
    fireEvent.focus(within(theme).getByRole("button"));
    expect(stage()).toBe("map:reinforce:theme:0");
    fireEvent.blur(within(theme).getByRole("button"));
    expect(stage()).toBe("map:reinforce:top");
  });

  it("a theme reached by keyboard from the map shows its own side, and keeps it as its step takes the lead", () => {
    renderHub();
    enter("map");
    const theme = within(step("reinforce")).getAllByTestId("brief-theme-row")[0];
    fireEvent.focus(within(theme).getByRole("button"));
    expect(stage()).toBe("map:reinforce:theme:0");
    enter("reinforce");
    expect(stage()).toBe("map:reinforce:theme:0");
    // A focused row gives way once the reader scrolls on to another step.
    enter("documents");
    expect(stage()).toBe("doc:A");
  });

  it("a theme pointed at while the documents lead shows its side, and only in its own list", () => {
    renderHub();
    enter("documents");
    expect(stage()).toBe("doc:A");
    const theme = within(step("reinforce")).getAllByTestId("brief-theme-row")[0];
    fireEvent.pointerEnter(theme);
    expect(stage()).toBe("map:reinforce:theme:0");
    expect(theme.getAttribute("data-hovered")).toBe("true");
    for (const row of within(step("apart")).queryAllByTestId("brief-theme-row")) {
      expect(row.getAttribute("data-hovered")).toBeNull();
    }
    fireEvent.pointerLeave(theme);
    expect(stage()).toBe("doc:A");
  });

  it("the strongest alignments: pointing brings a target forward, a click keeps it, a second click lets go", () => {
    const onExplore = vi.fn();
    renderHub({ onExplore });
    const rows = within(step("reinforce")).getAllByTestId("hub-strong-row");
    expect(rows).toHaveLength(6);
    expect(rows[0].textContent).toContain("Commitment C1");
    expect(within(rows[0]).getByText("8")).toBeTruthy();
    enter("reinforce");
    fireEvent.pointerEnter(rows[1]);
    expect(stage()).toBe("map:reinforce:target:C3");
    expect(rows[1].getAttribute("data-hovered")).toBe("true");
    fireEvent.pointerLeave(rows[1]);
    expect(stage()).toBe("map:reinforce:top");
    fireEvent.click(within(rows[1]).getByRole("button", { pressed: false }));
    expect(stage()).toBe("map:reinforce:target:C3");
    fireEvent.click(within(rows[1]).getByRole("button", { name: "Explore this target" }));
    expect(onExplore).toHaveBeenCalledWith("C3");
    fireEvent.click(within(rows[1]).getByRole("button", { pressed: true }));
    expect(stage()).toBe("map:reinforce:top");
    expect(within(rows[1]).queryByRole("button", { name: "Explore this target" })).toBeNull();
  });

  it("without the ring, an open row leads to the target's own panel", () => {
    const onOpenCommitment = vi.fn();
    renderHub({ onOpenCommitment });
    const rows = within(step("apart")).getAllByTestId("hub-apart-row");
    fireEvent.click(within(rows[0]).getByRole("button", { pressed: false }));
    fireEvent.click(within(rows[0]).getByRole("button", { name: "See its aligned and potentially misaligned targets" }));
    expect(onOpenCommitment).toHaveBeenCalledWith("B6");
  });

  it("where to look closer: how concentrated it is, its targets first, then its themes and types", () => {
    renderHub();
    const apart = step("apart");
    expect(within(apart).getByRole("heading", { level: 2 }).textContent).toBe(
      "Of the 15 potential misalignments, 80% involve just 2 targets.",
    );
    const rows = within(apart).getAllByTestId("hub-apart-row");
    expect(rows).toHaveLength(6);
    expect(rows[0].textContent).toContain("Commitment B6");
    const theme = within(apart).getAllByTestId("brief-theme-row")[0];
    const kind = within(apart).getByText("Competing for resources").closest("li")!;
    expect(rows[5].compareDocumentPosition(theme) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(theme.compareDocumentPosition(kind) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    enter("apart");
    fireEvent.pointerEnter(kind);
    expect(stage()).toBe("map:apart:kind:resource_competition");
    fireEvent.pointerLeave(kind);
    fireEvent.click(within(rows[1]).getByRole("button", { pressed: false }));
    expect(stage()).toBe(`map:apart:target:${DATA.commitments[1].commitment.id}`);
  });

  it("on the map, a named target is a way to its row, and a dot to its comparison", () => {
    withField(() => {
      const onOpenPair = vi.fn();
      renderHub({ onOpenPair });
      enter("apart");
      const layout = layoutHub({ kind: "map", side: "apart", focus: { kind: "top" } }, hubParticles(DATA), DATA, 800, 500);
      const b6 = layout.marks.find((m) => m.id === "B6")!;
      const name = screen.getByText(/Commitment B6/, { selector: ".brief-hub-mark-name" });
      expect(name.closest("[data-mark]")?.textContent).toBe("6 Commitment B6 Verbatim text of commitment B6.7");
      fireEvent.click(field(), { clientX: b6.labelX - 4, clientY: b6.labelY });
      expect(stage()).toBe("map:apart:target:B6");
      const row = within(step("apart")).getAllByTestId("hub-apart-row")[0];
      expect(within(row).getByRole("button", { pressed: true })).toBeTruthy();
      const i = DATA.scope.comparisons.findIndex((x) => x.a.id === "B6" && x.b.id === "C2");
      fireEvent.click(field(), { clientX: layout.x[i], clientY: layout.y[i] });
      expect(onOpenPair).toHaveBeenCalledWith("B6", "C2");
    });
  });

  it("lists every target a concentrated finding names, when they are more than six", () => {
    const top = ["X1", "X2", "X3", "X4", "X5", "X6", "X7"];
    const data = { ...DATA, concentration: { ...DATA.concentration, top, concentrated: true } };
    const commitments = Array.from({ length: 8 }, (_, i) => ({ ...DATA.commitments[i % DATA.commitments.length] }));
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <Hub data={{ ...data, commitments: commitments.map((c, i) => ({ ...c, commitment: { ...c.commitment, id: `X${i + 1}` } })) }} />
      </NextIntlClientProvider>,
    );
    expect(within(step("apart")).getAllByTestId("hub-apart-row")).toHaveLength(7);
  });

  it("sums up the document at the centre, and moves the hub from the finding's names", () => {
    const onOpenDocPair = vi.fn();
    renderHub({ onOpenDocPair });
    enter("documents");
    expect(screen.getByTestId("hub-focus").textContent).toBe(
      "Document A: 75% of its 72 target pairs are aligned; 8% show potential misalignment, the highest share with Document B (17%).",
    );
    fireEvent.click(within(screen.getByTestId("hub-focus")).getByRole("button", { name: "Document B" }));
    expect(onOpenDocPair).toHaveBeenLastCalledWith("A", "B");
    const headline = step("documents").querySelector("h2") as HTMLElement;
    fireEvent.click(within(headline).getByRole("button", { name: "Document B" }));
    expect(stage()).toBe("doc:B");
  });

  it("around the document in focus, another document's name puts it in the centre", () => {
    withField(() => {
      renderHub();
      enter("documents");
      expect(stage()).toBe("doc:A");
      const layout = layoutHub({ kind: "doc", doc: "A" }, hubParticles(DATA), DATA, 800, 500);
      const c = layout.groups.find((g) => g.key === "C")!;
      fireEvent.click(field(), { clientX: (c.x0 + c.x1) / 2, clientY: c.y0 - 20 });
      expect(stage()).toBe("doc:C");
      const rowC = within(step("documents")).getAllByTestId("brief-doc-row").find((r) => r.getAttribute("data-doc") === "C")!;
      expect(within(rowC).getByRole("button", { expanded: true })).toBeTruthy();
    });
  });

  it("keeps a translated finding translated, with its documents still linked", () => {
    render(
      <NextIntlClientProvider locale="es" messages={es} timeZone="UTC">
        <Hub data={DATA} />
      </NextIntlClientProvider>,
    );
    const together = within(step("map")).getByRole("heading");
    // Spanish sets a no-break space before the percent sign.
    expect(together.textContent).toMatch(/^Document A y Document C son los más alineados: 83\s%/);
    expect(within(together).getByRole("button", { name: "Document C" })).toBeTruthy();
  });

  it("follows a selection without potential misalignment, and one that adds it back", () => {
    const calm = buildBriefData(SOURCE, scopeOf(SOURCE, ["A", "C"]), null);
    expect(calm.counts.apart).toBe(0);
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <Hub data={calm} />
      </NextIntlClientProvider>,
    );
    expect(within(step("apart")).getByRole("heading", { level: 2 }).textContent).toBe(
      "No target shows potential misalignment.",
    );
    expect(within(step("apart")).queryAllByTestId("hub-apart-row")).toHaveLength(0);
    rerender(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <Hub data={DATA} />
      </NextIntlClientProvider>,
    );
    enter("apart");
    expect(stage()).toBe("map:apart:top");
    expect(within(step("apart")).getAllByTestId("hub-apart-row")).toHaveLength(6);
  });

  it("lets go of a picked target the selection no longer holds", () => {
    const { rerender } = renderHub();
    enter("apart");
    const rows = within(step("apart")).getAllByTestId("hub-apart-row");
    fireEvent.click(within(rows[0]).getByRole("button", { pressed: false }));
    expect(stage()).toBe("map:apart:target:B6");
    const withoutB = buildBriefData(SOURCE, scopeOf(SOURCE, ["A", "C"]), null);
    rerender(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <Hub data={withoutB} />
      </NextIntlClientProvider>,
    );
    expect(stage()).toBe("map:apart:top");
  });

  it("builds the hub around the document the reader picks", () => {
    renderHub();
    enter("documents");
    expect(stage()).toBe("doc:A");
    const rowB = within(step("documents")).getAllByTestId("brief-doc-row").find((r) => r.getAttribute("data-doc") === "B")!;
    fireEvent.click(within(rowB).getByRole("button", { expanded: false }));
    expect(stage()).toBe("doc:B");
  });
});
