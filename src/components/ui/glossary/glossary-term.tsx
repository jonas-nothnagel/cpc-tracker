"use client";

/**
 * GlossaryTerm — an inline term that reveals its definition on hover or focus.
 *
 * Modelled on the briefing's `AlignmentTermPopover` (sections/direction.tsx),
 * which pairs a definition with a real example pair. That one stays where it
 * is: it is coupled to fault-line data this component deliberately knows
 * nothing about. This is the general case — any term, any surface, definition
 * only — so the vocabulary can be explained wherever it first appears without
 * dragging briefing data along.
 *
 * Portaled to the body because the card cannot legally nest inside the
 * sentence <p> it interrupts, and deliberately not `role="tooltip"`: the card
 * is reachable and readable on its own, and a tooltip role would hide it from
 * users who need to move into it.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { GLOSSARY_ENABLED } from "./config";
import type { GlossaryTermId } from "@/data/glossary";

const CARD_WIDTH = 300;

export function GlossaryTerm({
  id,
  children,
}: {
  id: GlossaryTermId;
  /** The inline text to annotate. Defaults to the term's own label. */
  children?: ReactNode;
}) {
  const t = useTranslations("glossary");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!coords) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Claim the key so an enclosing panel does not also navigate back on the
      // same press — same reason InfoBox and OriginalLanguageChip do.
      e.preventDefault();
      setCoords(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [coords]);

  // The kill switch renders the term as the plain text it annotates, so the
  // page reads exactly as it did before the glossary existed.
  if (!GLOSSARY_ENABLED) return <>{children ?? t(`${id}.term`)}</>;

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const show = () => {
    cancelClose();
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
    // Clamp with the left edge as the floor so a narrow viewport overflows to
    // the right rather than pushing the card off-screen to the left.
    const left = Math.max(
      12,
      Math.min(r.left + r.width / 2 - CARD_WIDTH / 2, vw - CARD_WIDTH - 12),
    );
    setCoords({ top: r.bottom + 8, left });
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setCoords(null), 120);
  };

  return (
    <span
      className="relative inline"
      onMouseEnter={show}
      onMouseLeave={scheduleClose}
    >
      <button
        ref={triggerRef}
        type="button"
        // Toggle on click as well as hover: hover alone is unreachable on the
        // touch devices some country-office staff review on.
        onClick={() => (coords ? setCoords(null) : show())}
        onFocus={show}
        onBlur={scheduleClose}
        aria-expanded={coords !== null}
        className="inline text-left font-medium text-[var(--undp-black)] underline decoration-dotted decoration-from-font underline-offset-4 hover:decoration-solid focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--undp-blue)] focus-visible:ring-offset-2"
      >
        {children ?? t(`${id}.term`)}
      </button>
      {coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-label={t(`${id}.term`)}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            style={{ top: coords.top, left: coords.left, width: CARD_WIDTH }}
            className="fixed z-50 rounded-md border border-line bg-white p-3.5 shadow-xl"
          >
            <p className="text-caption font-semibold text-[var(--undp-black)] mb-1">
              {t(`${id}.term`)}
            </p>
            <p className="text-caption leading-relaxed text-[var(--undp-gray)]">
              {t(`${id}.definition`)}
            </p>
          </div>,
          document.body,
        )}
    </span>
  );
}
