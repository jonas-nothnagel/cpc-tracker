"use client";

/**
 * SlideDeckShell — replaces the scrollytell with a slide-deck UI.
 *
 * No vertical scroll inside a slide. The viewport is split into a text
 * panel (left) and a visual panel (right). Navigation is via the footer
 * (prev/next) or keyboard arrows. The final slide can switch its layout
 * to "explore" mode (custom children replace the text panel).
 *
 * The visual on the right is a persistent component owned by the parent;
 * the shell only routes which slide is currently active so the visual can
 * react to it.
 */

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export interface SlideDef {
  /** Eyebrow shown above the headline. */
  eyebrow: string;
  /** Headline rendered in serif display type. */
  headline: ReactNode;
  /** Body content. Anything React renderable. Keep short. */
  body?: ReactNode;
  /** Optional inline element (e.g. a primer pair card). */
  extra?: ReactNode;
  /** Mark the last "story" slide so the deck transitions to explore mode. */
  exploreLayout?: boolean;
}

export interface SlideDeckShellProps {
  slides: SlideDef[];
  /** Render prop for the persistent visual on the right of every slide. */
  renderVisual: (slideIndex: number) => ReactNode;
  /** Render prop for the explore-mode left panel (chat, sectors, etc). */
  renderExplore?: () => ReactNode;
  /** Optional caption that overlays the visual (e.g. interpretive hint). */
  renderVisualCaption?: (slideIndex: number) => ReactNode;
}

const HEADLINE_SERIF =
  "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif";

export function SlideDeckShell({
  slides,
  renderVisual,
  renderExplore,
  renderVisualCaption,
}: SlideDeckShellProps) {
  const [idx, setIdx] = useState(0);
  const total = slides.length;
  const slide = slides[idx];
  const isExplore = !!slide?.exploreLayout;

  const goNext = useCallback(() => {
    setIdx((i) => Math.min(total - 1, i + 1));
  }, [total]);
  const goPrev = useCallback(() => {
    setIdx((i) => Math.max(0, i - 1));
  }, []);

  // Keyboard nav. Skip when focus is in a form control so chat input arrows
  // navigate text, not slides.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev]);

  return (
    <div
      className="flex flex-col w-full"
      style={{ minHeight: "calc(100vh - 60px)" }}
    >
      <div className="flex-1 grid gap-6 px-6 md:px-10 py-6 md:py-8 max-w-[1400px] mx-auto w-full grid-cols-1 md:grid-cols-[minmax(0,420px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
        {isExplore ? (
          <div className="overflow-hidden flex flex-col">
            {renderExplore ? renderExplore() : null}
          </div>
        ) : (
          <TextPanel slide={slide} index={idx} total={total} />
        )}
        <div className="relative flex flex-col">
          <div className="flex-1 flex items-center justify-center min-h-[420px]">
            {renderVisual(idx)}
          </div>
          {renderVisualCaption && (
            <div className="text-center mt-2">{renderVisualCaption(idx)}</div>
          )}
        </div>
      </div>
      <DeckFooter
        idx={idx}
        total={total}
        onPrev={goPrev}
        onNext={goNext}
        onJump={setIdx}
      />
    </div>
  );
}

function TextPanel({
  slide,
  index,
  total,
}: {
  slide: SlideDef;
  index: number;
  total: number;
}) {
  return (
    <div className="flex flex-col justify-center pr-2 md:pr-6 py-4">
      <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--undp-gray)] mb-3">
        {slide.eyebrow}
        <span className="opacity-50 ml-2 tabular-nums">
          · {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
      </p>
      <h2
        className="text-[var(--undp-black)] font-medium leading-[1.1] mb-5"
        style={{
          fontFamily: HEADLINE_SERIF,
          fontSize: "clamp(1.625rem, 3.2vw, 2.5rem)",
          letterSpacing: "-0.012em",
        }}
      >
        {slide.headline}
      </h2>
      {slide.body && (
        <div className="text-[var(--undp-gray)] text-sm md:text-base leading-relaxed space-y-3">
          {slide.body}
        </div>
      )}
      {slide.extra && <div className="mt-5">{slide.extra}</div>}
    </div>
  );
}

function DeckFooter({
  idx,
  total,
  onPrev,
  onNext,
  onJump,
}: {
  idx: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onJump: (i: number) => void;
}) {
  const atFirst = idx === 0;
  const atLast = idx === total - 1;
  return (
    <div className="border-t border-gray-200 bg-white/60 backdrop-blur">
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-3 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onPrev}
          disabled={atFirst}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
            atFirst
              ? "text-gray-300 cursor-not-allowed"
              : "text-[var(--undp-black)] hover:bg-gray-100"
          }`}
          aria-label="Previous slide"
        >
          <span aria-hidden="true">←</span>
          Prev
        </button>

        <div className="flex items-center gap-2" role="tablist" aria-label="Slide progress">
          {Array.from({ length: total }).map((_, i) => {
            const isActive = i === idx;
            return (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={`Slide ${i + 1}`}
                onClick={() => onJump(i)}
                className="rounded-full transition-all"
                style={{
                  width: isActive ? 18 : 6,
                  height: 6,
                  backgroundColor: isActive
                    ? "var(--undp-black)"
                    : "#cfcdc7",
                }}
              />
            );
          })}
        </div>

        <button
          type="button"
          onClick={onNext}
          disabled={atLast}
          className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            atLast
              ? "text-gray-300 cursor-not-allowed"
              : "bg-[var(--undp-black)] text-white hover:bg-[var(--undp-blue-dark)]"
          }`}
          aria-label="Next slide"
        >
          {atLast ? "End" : "Next"}
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}
