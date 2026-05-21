"use client";

/**
 * ScrollytellShell — Phase A scaffold for the findings-first briefing.
 *
 * Stacks its children as full-height scenes and tracks which one is currently
 * most visible via IntersectionObserver. Exposes the active scene index via
 * context so children (e.g. the side progress indicator, or a future
 * sticky-centerpiece-with-text-scroll pattern in Phase B) can react.
 *
 * Intentionally minimal: no scroll math, no `prefers-reduced-motion` gating
 * needed because there's no animation yet. The dot indicator stays static
 * size and only the active dot changes opacity / color.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface ScrollytellState {
  activeScene: number;
  totalScenes: number;
  registerScene: (id: number, el: HTMLElement | null) => void;
}

const ScrollytellContext = createContext<ScrollytellState>({
  activeScene: 0,
  totalScenes: 0,
  registerScene: () => {},
});

export function useScrollytell(): ScrollytellState {
  return useContext(ScrollytellContext);
}

export function ScrollytellShell({
  children,
  totalScenes,
}: {
  children: ReactNode;
  totalScenes: number;
}) {
  const [activeScene, setActiveScene] = useState(0);
  const elements = useRef<Map<number, HTMLElement>>(new Map());

  const registerScene = useCallback((id: number, el: HTMLElement | null) => {
    if (el) {
      elements.current.set(id, el);
    } else {
      elements.current.delete(id);
    }
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    // Track each scene's intersection ratio; promote the one with the
    // highest visible share above a soft threshold so glancing scrolls
    // don't flicker the indicator.
    const ratios = new Map<number, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = Number(e.target.getAttribute("data-scene-id"));
          if (!Number.isNaN(id)) ratios.set(id, e.intersectionRatio);
        }
        let best = 0;
        let bestRatio = 0;
        for (const [id, ratio] of ratios) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            best = id;
          }
        }
        if (bestRatio > 0.25) setActiveScene(best);
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    for (const el of elements.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <ScrollytellContext.Provider
      value={{ activeScene, totalScenes, registerScene }}
    >
      <div className="relative">
        {children}
        <SceneProgressIndicator />
      </div>
    </ScrollytellContext.Provider>
  );
}

function SceneProgressIndicator() {
  const { activeScene, totalScenes } = useScrollytell();
  if (totalScenes <= 1) return null;
  return (
    <div className="fixed top-1/2 right-5 -translate-y-1/2 z-20 hidden md:flex flex-col gap-2.5 pointer-events-none">
      {Array.from({ length: totalScenes }).map((_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="block w-1.5 h-1.5 rounded-full transition-all duration-300"
          style={{
            backgroundColor:
              i === activeScene ? "var(--undp-black)" : "#d4d4d4",
            transform: i === activeScene ? "scale(1.6)" : "scale(1)",
          }}
        />
      ))}
    </div>
  );
}

/**
 * A single full-height scene. `id` is the position in the scrollytell (0-indexed)
 * and must be unique within a ScrollytellShell. Use `fullBleed` for scenes
 * whose content (typically the centerpiece) should escape the calm 680px
 * reading column.
 */
export function Scene({
  id,
  children,
  fullBleed = false,
  paddingY = "py-20",
  minHeight = "min-h-[90vh]",
}: {
  id: number;
  children: ReactNode;
  fullBleed?: boolean;
  paddingY?: string;
  minHeight?: string;
}) {
  const { registerScene } = useScrollytell();
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    registerScene(id, ref.current);
    return () => registerScene(id, null);
  }, [id, registerScene]);

  return (
    <section
      ref={ref}
      data-scene-id={id}
      className={`${minHeight} flex items-center ${paddingY} ${
        fullBleed ? "px-6" : "max-w-[680px] mx-auto px-6"
      }`}
    >
      <div className="w-full">{children}</div>
    </section>
  );
}
