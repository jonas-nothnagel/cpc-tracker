import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { DotCanvas, type CanvasGroup } from "./dot-field";

const GROUPS: CanvasGroup[] = [
  { key: "a", count: 30, color: "#000", tip: "a" },
  { key: "b", count: 10, color: "#000", tip: "b" },
];

let builds = 0;
const saved = {
  io: globalThis.IntersectionObserver,
  raf: globalThis.requestAnimationFrame,
  caf: globalThis.cancelAnimationFrame,
  ctx: HTMLCanvasElement.prototype.getContext,
};

beforeEach(() => {
  builds = 0;
  // A measurable field; a canvas context that draws nothing.
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(120);
  const noop = () => {};
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    setTransform: noop,
    clearRect: noop,
    beginPath: noop,
    arc: noop,
    moveTo: noop,
    rect: noop,
    fill: noop,
  })) as never;
  // Each build waits for the field to come into view: one observer per build.
  globalThis.IntersectionObserver = class {
    constructor() {
      builds += 1;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
  globalThis.requestAnimationFrame = (() => 1) as never;
  globalThis.cancelAnimationFrame = (() => {}) as never;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  globalThis.IntersectionObserver = saved.io;
  globalThis.requestAnimationFrame = saved.raf;
  globalThis.cancelAnimationFrame = saved.caf;
  HTMLCanvasElement.prototype.getContext = saved.ctx;
});

describe("DotCanvas", () => {
  it("keeps building when the pointer moves over a group", () => {
    const { rerender } = render(<DotCanvas groups={GROUPS} unit={1} />);
    expect(builds).toBe(1);
    rerender(<DotCanvas groups={GROUPS} unit={1} hovered="a" />);
    rerender(<DotCanvas groups={GROUPS} unit={1} hovered="b" />);
    rerender(<DotCanvas groups={GROUPS} unit={1} hovered={null} />);
    expect(builds).toBe(1);
  });

  it("builds again when asked to replay", () => {
    const { rerender } = render(<DotCanvas groups={GROUPS} unit={1} replay={0} />);
    rerender(<DotCanvas groups={GROUPS} unit={1} replay={1} />);
    expect(builds).toBe(2);
  });
});
