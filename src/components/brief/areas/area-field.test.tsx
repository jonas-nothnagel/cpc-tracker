import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { layoutAreaField } from "@/lib/brief/area-layout";
import { AreaField } from "./area-field";

const W = 212;
const saved = {
  w: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth"),
  ctx: HTMLCanvasElement.prototype.getContext,
};

// jsdom lays nothing out: give the field a width and no canvas.
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => W });
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
});

afterEach(() => {
  cleanup();
  if (saved.w) Object.defineProperty(HTMLElement.prototype, "clientWidth", saved.w);
  HTMLCanvasElement.prototype.getContext = saved.ctx;
});

const ROWS = [
  { id: "r1", targets: ["a", "b"] },
  { id: "r2", targets: ["c"] },
];
const REST = new Map([
  ["a", 4],
  ["b", 0],
  ["c", 0],
]);

type Props = Parameters<typeof AreaField>[0];

function renderField(overrides: Partial<Props> = {}) {
  const onPick = vi.fn();
  const field = (over: Partial<Props>) => (
    <AreaField
      rows={ROWS}
      restClouds={REST}
      clouds={REST}
      inks={new Map()}
      side="apart"
      rowLabel={(id) => `row ${id}`}
      listLabel="Policy areas"
      marked={new Set()}
      dimmed={new Set()}
      pointed={null}
      tipFor={(id) => `target ${id}`}
      formatCount={(n) => String(n)}
      onPick={onPick}
      {...overrides}
      {...over}
    />
  );
  const { container, rerender } = render(field({}));
  return {
    onPick,
    field: container.querySelector(".brief-av-field") as HTMLElement,
    canvas: container.querySelector("canvas") as HTMLCanvasElement,
    rerender: (over: Partial<Props>) => rerender(field(over)),
  };
}

/** Frames run by hand, at the times the test gives. */
function manualFrames() {
  let queue: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    queue.push(cb);
    return queue.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    queue = [];
  });
  vi.spyOn(performance, "now").mockReturnValue(0);
  return (time: number) => {
    const run = queue;
    queue = [];
    for (const cb of run) cb(time);
  };
}

describe("AreaField", () => {
  it("names every row in the order given, marking and setting back the rows asked for", () => {
    renderField({ marked: new Set(["r2"]), dimmed: new Set(["r1"]) });
    const rows = [...document.querySelectorAll("[data-row]")];
    expect(rows.map((r) => r.textContent)).toEqual(["row r1", "row r2"]);
    expect(rows[1].getAttribute("data-marked")).toBe("true");
    expect(rows[0].getAttribute("data-dim")).toBe("true");
    expect(rows[0].getAttribute("data-marked")).toBeNull();
  });

  it("names the target under the pointer and hands it on when selected", () => {
    const { field, onPick } = renderField();
    const a = layoutAreaField(ROWS, REST, W).at.get("a")!;
    fireEvent.pointerMove(field, { clientX: a.x, clientY: a.y - 2 });
    expect(screen.getByRole("presentation").textContent).toBe("target a");
    fireEvent.click(field, { clientX: a.x, clientY: a.y - 2 });
    expect(onPick).toHaveBeenCalledWith("a");
    fireEvent.pointerLeave(field);
    expect(screen.queryByRole("presentation")).toBeNull();
  });

  it("says the exact count above a cloud cut at its limit", () => {
    const clouds = new Map([
      ["a", 211],
      ["b", 0],
      ["c", 0],
    ]);
    renderField({ restClouds: clouds, clouds });
    expect(document.querySelector('[data-cut="a"]')?.textContent).toBe("211");
    expect(document.querySelector('[data-cut="b"]')).toBeNull();
  });

  it("gives screen readers the rows as a list", () => {
    renderField();
    const list = screen.getByRole("list", { name: "Policy areas" });
    expect(within(list).getAllByRole("listitem").map((r) => r.textContent)).toEqual(["row r1", "row r2"]);
  });

  it("keeps a move going when a target is pointed at meanwhile, naming no target until the dots arrive", () => {
    const step = manualFrames();
    const { field, rerender } = renderField();
    const moved = new Map([
      ["a", 1],
      ["b", 0],
      ["c", 0],
    ]);
    rerender({ clouds: moved });
    expect(field.getAttribute("data-moving")).toBe("true");
    const a = layoutAreaField(ROWS, REST, W).at.get("a")!;
    fireEvent.pointerMove(field, { clientX: a.x, clientY: a.y - 2 });
    expect(screen.queryByRole("presentation")).toBeNull();
    step(425);
    rerender({ clouds: moved, pointed: "a" });
    step(850);
    expect(field.getAttribute("data-moving")).toBeNull();
    fireEvent.pointerMove(field, { clientX: a.x, clientY: a.y - 2 });
    expect(screen.getByRole("presentation").textContent).toBe("target a");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("never draws a dot behind where its move began", () => {
    const step = manualFrames();
    const arcs: { x: number; r: number }[] = [];
    const ctx = new Proxy(
      {},
      {
        get: (_, key) => (key === "arc" ? (x: number, _y: number, r: number) => arcs.push({ x, r }) : () => {}),
        set: () => true,
      },
    );
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as never;
    const flat = new Map([
      ["a", 0],
      ["b", 0],
      ["c", 0],
    ]);
    const { rerender } = renderField({ restClouds: flat, clouds: flat });
    const layout = layoutAreaField(ROWS, flat, W);
    const left = layout.at.get("a")!.x;
    // a and b trade places: a moves right, b left.
    rerender({ rows: [{ id: "r1", targets: ["b", "a"] }, ROWS[1]], restClouds: flat, clouds: flat });
    arcs.length = 0;
    // A first frame stamped before the move began.
    step(-100);
    const dots = arcs.filter((a) => a.r === layout.targetR).map((a) => a.x);
    expect(Math.min(...dots)).toBeGreaterThanOrEqual(left - 1e-9);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("draws sharp again when the window moves to a screen of another pixel density", () => {
    const listeners: (() => void)[] = [];
    vi.stubGlobal(
      "matchMedia",
      () => ({ matches: false, addEventListener: (_: string, cb: () => void) => listeners.push(cb), removeEventListener: () => {} }),
    );
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 1 });
    const { canvas } = renderField();
    expect(canvas.width).toBe(W);
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
    act(() => listeners.forEach((cb) => cb()));
    expect(canvas.width).toBe(2 * W);
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 1 });
    vi.unstubAllGlobals();
  });
});
