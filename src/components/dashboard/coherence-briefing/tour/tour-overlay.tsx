"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { cutoutRect, placeTooltip, type Size } from "./geometry";
import type { BriefingTourId } from "./steps";
import { useTargetRect, type ResolvedStep } from "./use-tour";

interface TourOverlayProps {
  tourId: BriefingTourId;
  steps: ResolvedStep[];
  stepIndex: number;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
}

/** Padding between the target's bounding box and the spotlight edge. */
const SPOTLIGHT_PADDING = 8;
/** Matches the tooltip card's Tailwind width (w-80). */
const CARD_WIDTH = 320;

/**
 * Full-screen guided-tour overlay: a dimmed backdrop with a spotlight
 * cutout that glides between highlighted chart elements, plus a tooltip
 * card explaining how to read the highlighted part.
 *
 * The dimming is a single div positioned over the target with a huge
 * box-shadow, so moving between steps is one CSS transition. A separate
 * transparent full-viewport layer catches clicks (closes the tour) and
 * keeps the page inert while the tour is open.
 */
export function TourOverlay({
  tourId,
  steps,
  stepIndex,
  onNext,
  onBack,
  onClose,
}: TourOverlayProps) {
  const t = useTranslations("briefing.tour");
  const cardRef = useRef<HTMLDivElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [cardSize, setCardSize] = useState<Size>({ width: CARD_WIDTH, height: 180 });

  const current = steps[stepIndex] ?? null;
  const isLast = stepIndex === steps.length - 1;
  const targetRect = useTargetRect(current?.el ?? null, onClose);

  // Bring the highlighted element into view when the step changes — but only
  // if it is not already fully visible, and then with minimal movement.
  // Gratuitous scrolling is not just noise here: the briefing derives its
  // active section from scroll position (IntersectionObserver), and a section
  // flip swaps the sticky-aside centerpiece, unmounting the tour's target and
  // ending the tour mid-walkthrough.
  useEffect(() => {
    const el = current?.el;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const fullyVisible =
      r.top >= 0 &&
      r.left >= 0 &&
      r.bottom <= window.innerHeight &&
      r.right <= window.innerWidth;
    if (!fullyVisible) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [current]);

  // Measure the rendered card so placement uses its real height.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const { width, height } = card.getBoundingClientRect();
    setCardSize((prev) =>
      Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
        ? prev
        : { width, height },
    );
  }, [stepIndex, targetRect]);

  // Keyboard: Escape closes, arrows navigate, Tab stays inside the card.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        onNext();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onBack();
        return;
      }
      if (e.key === "Tab" && cardRef.current) {
        const focusable = cardRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onNext, onBack, onClose],
  );

  // Capture focus once per tour and restore it to the trigger on close.
  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement;
    return () => {
      previousFocus.current?.focus();
    };
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Keep focus on the primary action as steps advance.
  useEffect(() => {
    nextButtonRef.current?.focus();
  }, [stepIndex]);

  if (!current || !targetRect) return null;

  const spotlight = cutoutRect(targetRect, SPOTLIGHT_PADDING);
  const cardPos = placeTooltip(
    spotlight,
    cardSize,
    { width: window.innerWidth, height: window.innerHeight },
    current.step.placement,
  );

  return createPortal(
    <div className="fixed inset-0 z-[60]">
      {/* Click-catcher: keeps the page inert; clicking outside ends the tour. */}
      <div className="absolute inset-0" onClick={onClose} role="presentation" />
      {/* Spotlight: the box-shadow dims everything around the target. */}
      <div
        aria-hidden="true"
        className="fixed rounded-lg pointer-events-none transition-all duration-300 ease-out"
        style={{
          top: spotlight.top,
          left: spotlight.left,
          width: spotlight.width,
          height: spotlight.height,
          boxShadow: "0 0 0 200vmax rgba(0, 0, 0, 0.55)",
        }}
      />
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={t(`${tourId}.steps.${current.step.id}.title`)}
        className="fixed w-80 bg-white border border-gray-200 rounded-lg shadow-2xl px-4 py-3.5"
        style={{ top: cardPos.top, left: cardPos.left }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-body font-semibold text-[var(--undp-black)] leading-snug">
            {t(`${tourId}.steps.${current.step.id}.title`)}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("controls.close")}
            className="shrink-0 w-6 h-6 -mt-0.5 -mr-1 flex items-center justify-center rounded-full text-[var(--undp-gray)] hover:bg-gray-100 hover:text-[var(--undp-black)] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M3 3l8 8M11 3l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <p className="mt-1.5 text-body text-[var(--undp-black)] leading-relaxed">
          {t(`${tourId}.steps.${current.step.id}.body`)}
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span aria-live="polite" className="text-caption text-[var(--undp-gray)]">
            {t("controls.progress", { current: stepIndex + 1, total: steps.length })}
          </span>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={onBack}
                className="text-data px-3 py-1.5 rounded-full border border-line-strong text-[var(--undp-gray)] hover:text-[var(--undp-black)] hover:border-gray-400 transition-colors"
              >
                {t("controls.back")}
              </button>
            )}
            <button
              ref={nextButtonRef}
              type="button"
              onClick={onNext}
              className="text-data px-3 py-1.5 rounded-full bg-[var(--undp-blue)] text-white hover:opacity-90 transition-opacity"
            >
              {isLast ? t("controls.done") : t("controls.next")}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
