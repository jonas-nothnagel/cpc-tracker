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

const stage = () => document.querySelector("[data-hub-stage]")?.getAttribute("data-hub-stage");
const step = (name: string) => document.querySelector(`[data-step="${name}"]`) as HTMLElement;

describe("Hub", () => {
  it("opens on the overall picture and lets the reader go to aligned or potential misalignment", () => {
    renderHub();
    expect(
      screen.getByRole("heading", {
        name: "Across Testland's policies, 67% of target pairs are aligned and 14% show potential misalignment.",
      }),
    ).toBeTruthy();
    expect(stage()).toBe("overview");
    fireEvent.click(screen.getByRole("button", { name: "67% aligned" }));
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    expect(scroll.mock.contexts.map((el) => (el as HTMLElement).dataset.step)).toContain("reinforce");
  });

  it("re-forms the dots for the step in view: the map, then each side of it, then a target", () => {
    renderHub();
    enter("map");
    expect(stage()).toBe("map");
    enter("reinforce");
    expect(stage()).toBe("map:reinforce:top");
    enter("strong");
    expect(stage()).toBe("target:C1");
    enter("apart");
    expect(stage()).toBe("map:apart:top");
    enter("review");
    expect(stage()).toBe("target:B6");
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

  it("what works well: one section, its themes brought forward on the map from the list", () => {
    renderHub();
    const aligned = step("reinforce");
    expect(within(aligned).getByRole("heading", { level: 2 }).textContent).toBe(
      "Strong alignments are spread across 12 targets.",
    );
    enter("reinforce");
    const theme = within(aligned).getAllByTestId("brief-theme-row")[0];
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

  it("the strongest alignments: the first target in the centre, another on request, and its pairs one click away", () => {
    const onOpenCommitment = vi.fn();
    renderHub({ onOpenCommitment });
    const rows = within(step("strong")).getAllByTestId("hub-strong-row");
    expect(rows).toHaveLength(6);
    expect(rows[0].textContent).toContain("Commitment C1");
    expect(within(rows[0]).getByText("8")).toBeTruthy();
    enter("strong");
    expect(stage()).toBe("target:C1");
    fireEvent.click(within(rows[1]).getByRole("button", { pressed: false }));
    expect(stage()).toBe("target:C3");
    expect(onOpenCommitment).not.toHaveBeenCalled();
    fireEvent.click(within(rows[1]).getByRole("button", { name: /See all/ }));
    expect(onOpenCommitment).toHaveBeenCalledWith("C3");
  });

  it("where to look closer: how concentrated it is, its themes and types together, then its targets", () => {
    renderHub();
    const apart = step("apart");
    expect(within(apart).getByRole("heading", { level: 2 }).textContent).toBe(
      "Of the 15 potential misalignments, 80% involve just 2 targets.",
    );
    expect(within(apart).getByText("Competing for resources")).toBeTruthy();
    enter("apart");
    fireEvent.pointerEnter(within(apart).getByText("Competing for resources").closest("li")!);
    expect(stage()).toBe("map:apart:kind:resource_competition");
    const rows = within(step("review")).getAllByTestId("hub-apart-row");
    expect(rows).toHaveLength(6);
    expect(rows[0].textContent).toContain("Commitment B6");
    enter("review");
    expect(stage()).toBe("target:B6");
    fireEvent.click(within(rows[1]).getByRole("button", { pressed: false }));
    expect(stage()).toBe(`target:${DATA.commitments[1].commitment.id}`);
  });

  it("around a target, a pair opens its comparison and the name at the centre opens the target", () => {
    const w = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    const h = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 800 });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 500 });
    try {
      const onOpenPair = vi.fn();
      const onOpenCommitment = vi.fn();
      renderHub({ onOpenPair, onOpenCommitment });
      enter("review");
      const layout = layoutHub({ kind: "target", id: "B6" }, hubParticles(DATA), DATA, 800, 500);
      const i = DATA.scope.comparisons.findIndex((x) => x.a.id === "B6" && x.b.id === "C2");
      const field = document.querySelector(".brief-hub-canvas") as HTMLElement;
      fireEvent.click(field, { clientX: layout.x[i], clientY: layout.y[i] });
      expect(onOpenPair).toHaveBeenCalledWith("B6", "C2");
      fireEvent.click(field, { clientX: layout.center!.x, clientY: layout.center!.y });
      expect(onOpenCommitment).toHaveBeenCalledWith("B6");
    } finally {
      if (w) Object.defineProperty(HTMLElement.prototype, "clientWidth", w);
      if (h) Object.defineProperty(HTMLElement.prototype, "clientHeight", h);
    }
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
    expect(within(step("review")).getAllByTestId("hub-apart-row")).toHaveLength(7);
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

  it("follows steps that appear when the reader adds a document", () => {
    const calm = buildBriefData(SOURCE, scopeOf(SOURCE, ["A", "C"]), null);
    expect(calm.counts.apart).toBe(0);
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <Hub data={calm} />
      </NextIntlClientProvider>,
    );
    expect(step("review")).toBeNull();
    rerender(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <Hub data={DATA} />
      </NextIntlClientProvider>,
    );
    enter("review");
    expect(stage()).toBe("target:B6");
  });

  it("builds the wheel around the document the reader picks", () => {
    renderHub();
    enter("documents");
    expect(stage()).toBe("doc:A");
    const rowB = within(step("documents")).getAllByTestId("brief-doc-row").find((r) => r.getAttribute("data-doc") === "B")!;
    fireEvent.click(within(rowB).getByRole("button", { expanded: false }));
    expect(stage()).toBe("doc:B");
  });
});
