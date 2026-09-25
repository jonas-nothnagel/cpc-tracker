import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { buildBriefData } from "@/lib/brief/data";
import { scopeOf } from "@/lib/brief/compute";
import { hubParticles, layoutHub } from "@/lib/brief/hub";
import { briefFixture } from "@/lib/brief/test-fixture";
import { HubCanvas, type HubTarget } from "./hub-canvas";

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
      : `dot ${PARTICLES[t.index].ca}-${PARTICLES[t.index].cb}`;

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
    rerender(<HubCanvas data={DATA} stage={{ kind: "target", id: "B6" }} labelFor={() => null} tipFor={tipFor} />);
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

  it("around a target, names the pair under the pointer and opens it", () => {
    const stage = { kind: "target", id: "B6" } as const;
    const layout = layoutHub(stage, PARTICLES, DATA, W, H);
    const i = PARTICLES.findIndex((p) => p.ca === "B6" && p.cb === "C2");
    expect(layout.visible[i]).toBe(1);
    const onSelect = vi.fn();
    const { container } = render(
      <HubCanvas data={DATA} stage={stage} labelFor={() => null} tipFor={tipFor} onSelect={onSelect} />,
    );
    fireEvent.pointerMove(field(container), { clientX: layout.x[i], clientY: layout.y[i] });
    expect(screen.getByRole("presentation").textContent).toBe("dot B6-C2");
    fireEvent.click(field(container), { clientX: layout.x[i], clientY: layout.y[i] });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ kind: "dot", index: i }));
  });

  it("opens what is in focus from its name at the centre", () => {
    const stage = { kind: "target", id: "B6" } as const;
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
        center={<span>B6</span>}
      />,
    );
    fireEvent.click(field(container), { clientX: layout.center!.x, clientY: layout.center!.y });
    expect(onCenter).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
