import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { layoutRing } from "@/lib/brief/explore/ring";
import { flowerPaths, samplePath, type EdgeSpec } from "@/lib/brief/explore/lines";
import { RingCanvas } from "./ring-canvas";

const W = 800;
const H = 600;
// Two arcs of four seats; the line runs from the centre to seat 5.
const ARCS = [
  { key: "A", ids: [0, 1, 2, 3] },
  { key: "B", ids: [4, 5, 6, 7] },
];
const N = 8;
const EDGES: EdgeSpec[] = [{ id: 5, relation: "apart" }];
// With no arc names, the ring keeps its least room for them (56px + 16px).
const LABEL_ROOM = 72;

const saved = {
  w: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth"),
  h: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight"),
  ctx: HTMLCanvasElement.prototype.getContext,
  media: window.matchMedia,
};

beforeEach(() => {
  // jsdom lays nothing out: give the ring a size, and let it settle at once.
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => W });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => H });
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
  window.matchMedia = ((q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} })) as never;
});

afterEach(() => {
  cleanup();
  if (saved.w) Object.defineProperty(HTMLElement.prototype, "clientWidth", saved.w);
  if (saved.h) Object.defineProperty(HTMLElement.prototype, "clientHeight", saved.h);
  HTMLCanvasElement.prototype.getContext = saved.ctx;
  window.matchMedia = saved.media;
});

function renderRing(lineCue?: string) {
  const onLine = vi.fn();
  render(
    <RingCanvas
      arcs={ARCS}
      n={N}
      styles={Array.from({ length: N }, () => ({ color: "#cfcfc9" }))}
      edges={EDGES}
      neighbours={() => []}
      focus={0}
      highlight={null}
      selectedLine={null}
      labels={[]}
      centre={null}
      tipFor={() => "a seat"}
      lineTipFor={(id) => `the line to ${id}`}
      lineCue={lineCue}
      describe={() => ""}
      onSeat={vi.fn()}
      onLine={onLine}
      ariaLabel="Ring"
    />,
  );
  return { onLine };
}

/** A point halfway along the line, clear of every seat. */
function midLine() {
  const layout = layoutRing(ARCS, N, W, H, { labelHeight: LABEL_ROOM });
  const [path] = flowerPaths(layout, ARCS, EDGES);
  const pts = samplePath(path, 14);
  const [x, y] = pts[Math.floor(pts.length / 2)];
  return { clientX: x, clientY: y };
}

describe("RingCanvas", () => {
  it("says what a click on a line opens when the pointer is on it, and opens it", () => {
    const { onLine } = renderRing("Open the comparison");
    const ring = screen.getByRole("application", { name: "Ring" });
    const at = midLine();
    fireEvent.pointerMove(ring, at);
    const tip = screen.getByRole("presentation");
    expect(tip.textContent).toContain("the line to 5");
    expect(tip.textContent).toContain("Open the comparison");
    fireEvent.click(ring, at);
    expect(onLine).toHaveBeenCalledWith(5);
  });
});
