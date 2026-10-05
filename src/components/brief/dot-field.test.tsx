import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import { DotCanvas, DotField, type CanvasGroup } from "./dot-field";

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

  it("starts a mixed entrance with every dot on another dot's seat in the same field", () => {
    // Each paint's dot centres in drawing order; a paint starts by clearing.
    const paints: string[][] = [];
    const noop = () => {};
    const at = (x: number, y: number) => paints[paints.length - 1].push(`${x.toFixed(2)},${y.toFixed(2)}`);
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      setTransform: noop,
      clearRect: () => paints.push([]),
      beginPath: noop,
      arc: at,
      moveTo: noop,
      rect: at,
      fill: noop,
    })) as never;
    render(<DotCanvas groups={GROUPS} unit={1} still />);
    const seats = paints[paints.length - 1];
    cleanup();
    paints.length = 0;
    // The field waits to come into view (the observer never fires here),
    // drawn as it starts.
    render(<DotCanvas groups={GROUPS} unit={1} entrance="mixed" />);
    const start = paints[0];
    expect([...start].sort()).toEqual([...seats].sort());
    expect(start).not.toEqual(seats);
  });
});

describe("DotField", () => {
  const field = (node: ReactNode) =>
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        {node}
      </NextIntlClientProvider>,
    );
  const shares = () =>
    [...document.querySelectorAll<HTMLElement>(".brief-dots-label")].map((el) => ({
      text: el.textContent,
      left: parseFloat(el.style.left),
    }));

  it("names each group's share over it", () => {
    field(<DotField counts={{ reinforce: 66, partial: 29, apart: 5, none: 0, total: 100 }} shares />);
    expect(shares().map((s) => s.text)).toEqual(["66%", "29%", "5%"]);
  });

  it("gives every group room for its share, however small", () => {
    // 5 of 1,000 pairs make a group one column wide; its share needs more.
    field(<DotField counts={{ reinforce: 990, partial: 0, apart: 5, none: 5, total: 1000 }} shares />);
    const lefts = shares().map((s) => s.left);
    expect(lefts).toHaveLength(3);
    for (let i = 1; i < lefts.length; i++) expect(lefts[i] - lefts[i - 1]).toBeGreaterThanOrEqual(44);
  });
});
