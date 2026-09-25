import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { buildBriefData } from "@/lib/brief/data";
import { scopeOf } from "@/lib/brief/compute";
import { hubParticles, layoutHub } from "@/lib/brief/hub";
import { briefFixture } from "@/lib/brief/test-fixture";
import { HubCanvas, cellRect, mixInk, stageKey, type HubTarget } from "./hub-canvas";

const SOURCE = briefFixture({ themes: true });
const DATA = buildBriefData(SOURCE, scopeOf(SOURCE, ["A", "B", "C"]), null);
const PARTICLES = hubParticles(DATA);
const W = 800;
const H = 500;

// jsdom lays nothing out: give the field a size so its groups exist.
const sizes = {
  w: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth"),
  h: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight"),
  ctx: HTMLCanvasElement.prototype.getContext,
};

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => W });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => H });
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
});

afterEach(() => {
  cleanup();
  if (sizes.w) Object.defineProperty(HTMLElement.prototype, "clientWidth", sizes.w);
  if (sizes.h) Object.defineProperty(HTMLElement.prototype, "clientHeight", sizes.h);
  HTMLCanvasElement.prototype.getContext = sizes.ctx;
});

const tipFor = (t: HubTarget) =>
  t.kind === "group"
    ? `group ${t.group.key}`
    : t.kind === "axis"
      ? `axis ${t.axis.key}`
      : t.kind === "mark"
        ? `mark ${t.mark.id}`
        : `dot ${PARTICLES[t.index].ca}-${PARTICLES[t.index].cb}`;

const APART = { kind: "map", side: "apart", focus: { kind: "top" } } as const;

const field = (container: HTMLElement) => container.querySelector(".brief-hub-canvas") as HTMLElement;

describe("HubCanvas", () => {
  it("names the block under the pointer, and forgets it when the step changes", () => {
    const layout = layoutHub({ kind: "map" }, PARTICLES, DATA, W, H);
    const block = layout.groups.find((g) => g.key === "A<->C")!;
    const { container, rerender } = render(
      <HubCanvas data={DATA} stage={{ kind: "map" }} labelFor={() => null} tipFor={tipFor} />,
    );
    fireEvent.pointerMove(field(container), { clientX: (block.x0 + block.x1) / 2, clientY: (block.y0 + block.y1) / 2 });
    expect(screen.getByRole("presentation").textContent).toBe("group A<->C");
    // The dots re-form for the next step under a still pointer: the old
    // name must not be read against the new step's groups.
    rerender(<HubCanvas data={DATA} stage={{ kind: "doc", doc: "A" }} labelFor={() => null} tipFor={tipFor} />);
    expect(screen.queryByRole("presentation")).toBeNull();
  });

  it("keeps a name under the pointer while only the map's emphasis changes", () => {
    const layout = layoutHub({ kind: "map" }, PARTICLES, DATA, W, H);
    const b = layout.axis.find((a) => a.key === "B")!;
    const { container, rerender } = render(
      <HubCanvas data={DATA} stage={{ kind: "map" }} labelFor={() => null} tipFor={tipFor} />,
    );
    fireEvent.pointerMove(field(container), {
      clientX: (b.square.x0 + b.square.x1) / 2,
      clientY: (b.square.y0 + b.square.y1) / 2,
    });
    // Pointing at a document brings it forward: the dots stay where they are.
    rerender(
      <HubCanvas data={DATA} stage={{ kind: "map", focus: { kind: "doc", doc: "B" } }} labelFor={() => null} tipFor={tipFor} />,
    );
    expect(screen.getByRole("presentation").textContent).toBe("axis B");
  });

  it("names the documents along the map's diagonal, and a document under the pointer", () => {
    const layout = layoutHub({ kind: "map" }, PARTICLES, DATA, W, H);
    const { container } = render(
      <HubCanvas data={DATA} stage={{ kind: "map" }} labelFor={() => null} tipFor={tipFor} />,
    );
    const names = [...container.querySelectorAll("[data-axis]")].map((el) => el.textContent);
    expect(names).toEqual(["Document A", "Document B", "Document C"]);
    const b = layout.axis.find((a) => a.key === "B")!;
    fireEvent.pointerMove(field(container), {
      clientX: (b.square.x0 + b.square.x1) / 2,
      clientY: (b.square.y0 + b.square.y1) / 2,
    });
    expect(screen.getByRole("presentation").textContent).toBe("axis B");
  });

  it("on a side, names the pair under the pointer and opens it", () => {
    const layout = layoutHub(APART, PARTICLES, DATA, W, H);
    const i = PARTICLES.findIndex((p) => p.ca === "B6" && p.cb === "C1");
    expect(layout.visible[i]).toBe(1);
    const onSelect = vi.fn();
    const { container } = render(
      <HubCanvas data={DATA} stage={APART} labelFor={() => null} tipFor={tipFor} onSelect={onSelect} />,
    );
    fireEvent.pointerMove(field(container), { clientX: layout.x[i], clientY: layout.y[i] });
    expect(screen.getByRole("presentation").textContent).toBe("dot B6-C1");
    fireEvent.click(field(container), { clientX: layout.x[i], clientY: layout.y[i] });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ kind: "dot", index: i }));
  });

  it("keeps a side's tip while only its emphasis changes, and drops it on the other side", () => {
    const layout = layoutHub(APART, PARTICLES, DATA, W, H);
    const i = PARTICLES.findIndex((p) => p.ca === "B6" && p.cb === "C1");
    const { container, rerender } = render(
      <HubCanvas data={DATA} stage={APART} labelFor={() => null} tipFor={tipFor} />,
    );
    fireEvent.pointerMove(field(container), { clientX: layout.x[i], clientY: layout.y[i] });
    const b6 = { kind: "map", side: "apart", focus: { kind: "target", id: "B6" } } as const;
    rerender(<HubCanvas data={DATA} stage={b6} labelFor={() => null} tipFor={tipFor} />);
    expect(screen.getByRole("presentation").textContent).toBe("dot B6-C1");
    const strong = { kind: "map", side: "reinforce", focus: { kind: "top" } } as const;
    rerender(<HubCanvas data={DATA} stage={strong} labelFor={() => null} tipFor={tipFor} />);
    expect(screen.queryByRole("presentation")).toBeNull();
  });

  it("names the targets a side carries, and each name is a way to its target", () => {
    const layout = layoutHub(APART, PARTICLES, DATA, W, H);
    const b6 = layout.marks.find((m) => m.id === "B6")!;
    const onHover = vi.fn();
    const onSelect = vi.fn();
    const { container } = render(
      <HubCanvas
        data={DATA}
        stage={APART}
        labelFor={() => null}
        tipFor={tipFor}
        onHover={onHover}
        onSelect={onSelect}
        markLabel={(m) => `${m.id} (${m.count})`}
      />,
    );
    const names = [...container.querySelectorAll("[data-mark]")].map((el) => el.textContent);
    expect(names).toEqual(["A6 (6)", "B6 (7)"]);
    // The end of a name, beside the diagonal.
    const at = { clientX: b6.labelX - 4, clientY: b6.labelY };
    fireEvent.pointerMove(field(container), at);
    expect(onHover).toHaveBeenLastCalledWith("target:apart:B6");
    expect(screen.getByRole("presentation").textContent).toBe("mark B6");
    fireEvent.click(field(container), at);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ kind: "mark", mark: b6 }));
  });

  it("sets the other names back while one target is in focus", () => {
    const stage = { kind: "map", side: "apart", focus: { kind: "target", id: "B6" } } as const;
    const { container } = render(
      <HubCanvas data={DATA} stage={stage} labelFor={() => null} markLabel={(m) => m.id} />,
    );
    const a6 = container.querySelector('[data-mark="A6"]') as HTMLElement;
    const b6 = container.querySelector('[data-mark="B6"]') as HTMLElement;
    expect(a6.getAttribute("data-dim")).toBe("true");
    expect(b6.getAttribute("data-on")).toBe("true");
  });

  it("around a document, another document is a way in by its name as well as its dots", () => {
    const stage = { kind: "doc", doc: "A" } as const;
    const layout = layoutHub(stage, PARTICLES, DATA, W, H);
    const c = layout.groups.find((g) => g.key === "C")!;
    const onSelect = vi.fn();
    const { container } = render(
      <HubCanvas data={DATA} stage={stage} labelFor={() => null} tipFor={tipFor} onSelect={onSelect} />,
    );
    // The name sits in the band above its dots.
    fireEvent.click(field(container), { clientX: (c.x0 + c.x1) / 2, clientY: c.y0 - 20 });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ kind: "group", group: expect.objectContaining({ key: "C" }) }));
  });

  it("opens what is in focus from its name at the centre", () => {
    const stage = { kind: "doc", doc: "A" } as const;
    const layout = layoutHub(stage, PARTICLES, DATA, W, H);
    const onCenter = vi.fn();
    const onSelect = vi.fn();
    const { container } = render(
      <HubCanvas
        data={DATA}
        stage={stage}
        labelFor={() => null}
        tipFor={tipFor}
        onSelect={onSelect}
        onCenter={onCenter}
        center={<span>A</span>}
      />,
    );
    fireEvent.click(field(container), { clientX: layout.center!.x, clientY: layout.center!.y });
    expect(onCenter).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("opens what is in focus from anywhere on its name, however many lines it takes", () => {
    const stage = { kind: "doc", doc: "A" } as const;
    const layout = layoutHub(stage, PARTICLES, DATA, W, H);
    const onCenter = vi.fn();
    const { container } = render(
      <HubCanvas data={DATA} stage={stage} labelFor={() => null} tipFor={tipFor} onCenter={onCenter} center={<span>A</span>} />,
    );
    // A long name reaches well above the middle of the field.
    const name = container.querySelector(".brief-hub-center") as HTMLElement;
    const top = layout.center!.y - 120;
    name.getBoundingClientRect = () =>
      ({ left: layout.center!.x - 70, right: layout.center!.x + 70, top, bottom: layout.center!.y + 60 }) as DOMRect;
    fireEvent.click(field(container), { clientX: layout.center!.x, clientY: top + 4 });
    expect(onCenter).toHaveBeenCalledTimes(1);
  });
});

describe("drawing the map", () => {
  it("draws every side's pairs as squares on the grid, on a pale square per pair of documents", () => {
    const calls: { fn: string; args: unknown[] }[] = [];
    const record = (fn: string) => (...args: unknown[]) => void calls.push({ fn, args });
    const ctx = new Proxy(
      { globalAlpha: 1, fillStyle: "", strokeStyle: "", lineWidth: 1 } as Record<string, unknown>,
      { get: (target, key: string) => (key in target ? target[key] : record(key)) },
    );
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as never;
    const media = window.matchMedia;
    // Reduced motion: the field settles at once, so one draw shows the result.
    window.matchMedia = ((q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} })) as never;
    try {
      render(<HubCanvas data={DATA} stage={APART} labelFor={() => null} markLabel={(m) => m.id} />);
      // The last frame: everything after the last clear.
      const last = calls.map((c) => c.fn).lastIndexOf("clearRect");
      expect(last).toBeGreaterThanOrEqual(0);
      calls.splice(0, last);
      const layout = layoutHub(APART, PARTICLES, DATA, W, H);
      // A pale square for each of the three pairs of documents.
      expect(calls.filter((c) => c.fn === "fillRect")).toHaveLength(layout.groups.length);
      // Each of the 15 potential misalignments as one square cell.
      const cells = calls.filter((c) => c.fn === "rect");
      expect(cells).toHaveLength(15);
      for (const c of cells) {
        const [x, y, w, h] = c.args as number[];
        expect(Number.isInteger(x * 2) && Number.isInteger(y * 2)).toBe(true);
        expect(w).toBeGreaterThan(0);
        expect(h).toBeGreaterThan(0);
      }
      // A lead from each named target to its point.
      expect(calls.filter((c) => c.fn === "lineTo").length).toBeGreaterThanOrEqual(layout.axis.length + layout.marks.length);
    } finally {
      window.matchMedia = media;
    }
  });
});

describe("the map on any screen", () => {
  it("draws at the screen's own pixel ratio, so a 125% screen is as sharp as a Retina one", () => {
    const ctx = new Proxy({ globalAlpha: 1 } as Record<string, unknown>, {
      get: (target, key: string) => (key in target ? target[key] : () => undefined),
    });
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as never;
    const media = window.matchMedia;
    const ratio = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
    window.matchMedia = ((q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} })) as never;
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 1.25 });
    try {
      const { container } = render(<HubCanvas data={DATA} stage={APART} labelFor={() => null} />);
      expect((container.querySelector("canvas") as HTMLCanvasElement).width).toBe(Math.round(W * 1.25));
    } finally {
      window.matchMedia = media;
      if (ratio) Object.defineProperty(window, "devicePixelRatio", ratio);
      else delete (window as { devicePixelRatio?: number }).devicePixelRatio;
    }
  });
});

describe("stageKey", () => {
  it("names each arrangement and question of the field", () => {
    expect(stageKey({ kind: "overview" })).toBe("overview");
    expect(stageKey({ kind: "map" })).toBe("map");
    expect(stageKey({ kind: "map", tone: "reinforce" })).toBe("map:tone:reinforce");
    expect(stageKey({ kind: "map", focus: { kind: "doc", doc: "B" } })).toBe("map:doc:B");
    expect(stageKey({ kind: "map", side: "reinforce", focus: { kind: "top" } })).toBe("map:reinforce:top");
    expect(stageKey({ kind: "map", side: "apart", focus: { kind: "theme", index: 1 } })).toBe("map:apart:theme:1");
    expect(stageKey({ kind: "map", side: "apart", focus: { kind: "mechanism", mechanism: "goal_conflict" } })).toBe(
      "map:apart:kind:goal_conflict",
    );
    expect(stageKey({ kind: "map", side: "apart", focus: { kind: "target", id: "B6" } })).toBe("map:apart:target:B6");
    expect(stageKey({ kind: "doc", doc: "A" })).toBe("doc:A");
  });
});

describe("the map's cells", () => {
  it("sit on the pixel grid, a device pixel apart when there is room", () => {
    // 2.41 css px at 2 device px each: 5 device px, 4 filled.
    expect(cellRect(10.3, 20.7, 2.41, 2)).toEqual({ x: 9, y: 19.5, w: 2, h: 2 });
    // Too small for a gap: the whole cell, never under one device pixel.
    expect(cellRect(10, 10, 1, 2).w).toBe(1);
    expect(cellRect(10, 10, 0.3, 2).w).toBe(0.5);
  });

  it("keep one device pixel between neighbours, whatever fraction of a pixel a cell is", () => {
    for (const [pitch, dpr] of [[2.3, 2], [2.41, 2], [4.6, 1], [1.9, 1.5]]) {
      const row = Array.from({ length: 16 }, (_, i) => cellRect(7.3 + i * pitch, 5, pitch, dpr));
      for (let i = 1; i < row.length; i++) {
        expect(row[i].x - (row[i - 1].x + row[i - 1].w)).toBeCloseTo(1 / dpr);
      }
    }
  });

  it("sit on the screen's own pixel grid at any scaling", () => {
    for (const dpr of [1, 1.25, 1.5]) {
      const c = cellRect(10.3, 20.7, 2.41, dpr);
      for (const v of [c.x, c.y, c.w, c.h]) expect(Math.abs(v * dpr - Math.round(v * dpr))).toBeLessThan(1e-9);
    }
  });

  it("are paler in a lighter ink, never transparent", () => {
    expect(mixInk("#d2432c", "#f0f0ee", 1)).toBe("rgb(210,67,44)");
    expect(mixInk("#d2432c", "#f0f0ee", 0)).toBe("rgb(240,240,238)");
    expect(mixInk("#000000", "#ffffff", 0.5)).toBe("rgb(128,128,128)");
  });
});
