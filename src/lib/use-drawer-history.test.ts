import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDrawerHistory } from "./use-drawer-history";

interface Subject {
  id: string;
}

describe("useDrawerHistory", () => {
  it("starts empty when the root subject is null", () => {
    const { result } = renderHook(() => useDrawerHistory<Subject>(null));
    expect(result.current.current).toBeNull();
    expect(result.current.previous).toBeNull();
    expect(result.current.canGoBack).toBe(false);
  });

  it("seeds the stack with the initial root subject", () => {
    const root = { id: "root" };
    const { result } = renderHook(() => useDrawerHistory<Subject>(root));
    expect(result.current.current).toBe(root);
    expect(result.current.canGoBack).toBe(false);
  });

  it("push appends and back pops, exposing previous in between", () => {
    const root = { id: "root" };
    const child = { id: "child" };
    const { result } = renderHook(() => useDrawerHistory<Subject>(root));

    act(() => {
      result.current.push(child);
    });
    expect(result.current.current).toBe(child);
    expect(result.current.previous).toBe(root);
    expect(result.current.canGoBack).toBe(true);

    act(() => {
      result.current.back();
    });
    expect(result.current.current).toBe(root);
    expect(result.current.previous).toBeNull();
    expect(result.current.canGoBack).toBe(false);
  });

  it("back is a no-op at the root", () => {
    const root = { id: "root" };
    const { result } = renderHook(() => useDrawerHistory<Subject>(root));
    act(() => {
      result.current.back();
    });
    expect(result.current.current).toBe(root);
    expect(result.current.canGoBack).toBe(false);
  });

  it("resets the stack when the root subject identity changes", () => {
    const root1 = { id: "root1" };
    const root2 = { id: "root2" };
    const { result, rerender } = renderHook(
      ({ root }: { root: Subject | null }) => useDrawerHistory<Subject>(root),
      { initialProps: { root: root1 as Subject | null } },
    );
    act(() => {
      result.current.push({ id: "drill" });
    });
    expect(result.current.canGoBack).toBe(true);

    rerender({ root: root2 });
    expect(result.current.current).toBe(root2);
    expect(result.current.canGoBack).toBe(false);
  });

  it("clears the stack when the root subject becomes null", () => {
    const root = { id: "root" };
    const { result, rerender } = renderHook(
      ({ r }: { r: Subject | null }) => useDrawerHistory<Subject>(r),
      { initialProps: { r: root as Subject | null } },
    );
    act(() => {
      result.current.push({ id: "drill" });
    });

    rerender({ r: null });
    expect(result.current.current).toBeNull();
    expect(result.current.canGoBack).toBe(false);
  });

  it("preserves the stack when the root reference is stable across renders", () => {
    const root = { id: "root" };
    const child = { id: "child" };
    const { result, rerender } = renderHook(
      ({ r }: { r: Subject | null }) => useDrawerHistory<Subject>(r),
      { initialProps: { r: root as Subject | null } },
    );
    act(() => {
      result.current.push(child);
    });

    rerender({ r: root });
    expect(result.current.current).toBe(child);
    expect(result.current.canGoBack).toBe(true);
  });
});
