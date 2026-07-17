"use client";

/**
 * Per-document reference card + hover affordance.
 *
 * `DocMetaCard` renders a document's primary-sourced reference metadata
 * (kind, when developed, by whom, main goal, link) plus, where available, how
 * many of its targets carry an extracted deadline. It is deliberately compact
 * and label-light: the document's own colour dot leads the "kind" line (tying it
 * to the same colour on the wheel and the doc legend), the facts sit on one
 * tight line, and the goal is set in the briefing serif as the document's own
 * voice. All values trace to the country config (`getDocMeta`); the card renders
 * only the fields that exist.
 *
 * `DocHoverCard` wraps any trigger so the same card appears on hover/focus,
 * portaled to the body (mirroring the briefing's AlignmentTermPopover). Used on
 * the wheel's document legend and the add/remove-documents list so a reader from
 * another ministry can place a document they don't know without leaving the view.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  getDocColor,
  getDocFullLabel,
  getDocMeta,
  type DocMeta,
} from "@/lib/utils";
import type { CountryConfig, PolicyDocumentType } from "@/types";

const HEADLINE_SERIF = "var(--font-display)";

export function DocMetaCard({
  meta,
  color,
  fullTitle,
  deadlineCoverage,
  hideDot = false,
}: {
  meta: DocMeta;
  /** The document's identity colour, used for the leading dot + deadline sliver. */
  color: string;
  /** Shown only in the hover card, where the title isn't already on screen. */
  fullTitle?: string;
  /** When provided and non-empty, shows the time-bound coverage sliver + count. */
  deadlineCoverage?: { total: number; timeBound: number };
  /** Hide the leading colour dot when the context already shows it (overview rows). */
  hideDot?: boolean;
}) {
  const t = useTranslations("briefing.docFocus");
  const factLine = [meta.published, meta.author].filter(Boolean).join(" · ");
  const showDeadlines = Boolean(deadlineCoverage && deadlineCoverage.total > 0);
  const pct =
    deadlineCoverage && deadlineCoverage.total > 0
      ? Math.round((deadlineCoverage.timeBound / deadlineCoverage.total) * 100)
      : 0;
  return (
    <div className="space-y-1.5">
      {fullTitle && (
        <p
          className="text-data font-semibold text-[var(--undp-black)] leading-snug"
          style={{ fontFamily: HEADLINE_SERIF }}
        >
          {fullTitle}
        </p>
      )}
      {meta.docKind && (
        <p className="flex items-start gap-1.5 text-caption font-medium text-[var(--undp-black)] leading-snug">
          {!hideDot && (
            <span
              aria-hidden="true"
              className="mt-[5px] inline-block h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: color }}
            />
          )}
          <span>{meta.docKind}</span>
        </p>
      )}
      {factLine && (
        <p className="text-caption text-[var(--undp-gray)] leading-snug">
          {factLine}
        </p>
      )}
      {meta.objective && (
        <p
          className="text-caption italic text-[var(--undp-black)] leading-snug"
          style={{ fontFamily: HEADLINE_SERIF }}
        >
          {meta.objective}
        </p>
      )}
      {meta.url && (
        <a
          href={meta.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-caption font-medium text-[var(--undp-blue)] hover:underline"
        >
          {t("viewDocument")}
          <span aria-hidden="true">↗</span>
        </a>
      )}
      {showDeadlines && deadlineCoverage && (
        <div className="flex items-center gap-2 pt-0.5">
          <span
            aria-hidden="true"
            className="h-1 w-14 rounded-full bg-black/10 overflow-hidden shrink-0"
          >
            <span
              className="block h-full rounded-full"
              style={{ width: `${pct}%`, backgroundColor: color }}
            />
          </span>
          <span className="text-caption text-[var(--undp-gray)] leading-snug">
            {t("deadlineCoverage", {
              timeBound: deadlineCoverage.timeBound,
              total: deadlineCoverage.total,
            })}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Hover/focus wrapper that shows the document's reference card next to `children`.
 * Renders children untouched when the document carries no reference metadata, so
 * documents without a sourced record (e.g. internal reviews) get no empty card.
 */
export function DocHoverCard({
  doc,
  countryConfig,
  children,
}: {
  doc: PolicyDocumentType;
  countryConfig: CountryConfig | null;
  children: ReactNode;
}) {
  const meta = getDocMeta(countryConfig, doc);
  const hasMeta = Boolean(
    meta.docKind || meta.published || meta.author || meta.objective || meta.url,
  );
  const ref = useRef<HTMLSpanElement>(null);
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
  if (!hasMeta) return <>{children}</>;
  const color = getDocColor(countryConfig, doc);
  const fullTitle = getDocFullLabel(countryConfig, doc);
  const open = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
    const W = 300;
    // Clamp with the left edge as the floor: on a viewport too narrow to fit
    // the card, pin to 12 (card overflows the right edge) rather than letting
    // Math.min pick a negative left that pushes it off the left edge.
    const left = Math.max(12, Math.min(r.left, vw - W - 12));
    setCoords({ top: r.bottom + 6, left });
  };
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setCoords(null), 120);
  };
  return (
    <span
      ref={ref}
      className="inline-flex"
      onMouseEnter={open}
      onMouseLeave={scheduleClose}
      onFocus={open}
      onBlur={scheduleClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") setCoords(null);
      }}
    >
      {children}
      {coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            onMouseEnter={() => {
              if (closeTimer.current) clearTimeout(closeTimer.current);
            }}
            onMouseLeave={scheduleClose}
            className="fixed z-50 w-[300px] rounded-md border border-line bg-white p-3.5 shadow-xl"
            style={{ top: coords.top, left: coords.left }}
          >
            <DocMetaCard meta={meta} color={color} fullTitle={fullTitle} />
          </div>,
          document.body,
        )}
    </span>
  );
}

/**
 * Click-to-reveal popover for the focused document's reference card. Used on the
 * Doc-in-Focus title: clicking the title surfaces the metadata as a floating card
 * (portaled) rather than pushing it inline. Closes on outside click or Escape.
 */
export function DocInfoPopover({
  meta,
  color,
  deadlineCoverage,
  children,
}: {
  meta: DocMeta;
  color: string;
  deadlineCoverage?: { total: number; timeBound: number };
  children: ReactNode;
}) {
  const t = useTranslations("briefing.docFocus");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const open = coords !== null;
  const toggle = () => {
    if (open) {
      setCoords(null);
      return;
    }
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
    const W = 340;
    // Clamp with the left edge as the floor: on a viewport too narrow to fit
    // the card, pin to 12 (card overflows the right edge) rather than letting
    // Math.min pick a negative left that pushes it off the left edge.
    const left = Math.max(12, Math.min(r.left, vw - W - 12));
    setCoords({ top: r.bottom + 8, left });
  };
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (cardRef.current?.contains(target)) return;
      setCoords(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCoords(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="group inline-flex items-start gap-1.5 text-left"
      >
        {children}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden="true"
          className={`mt-[6px] shrink-0 text-[var(--undp-gray)] transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          <path
            d="M2 3.5 L5 6.5 L8 3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={cardRef}
            role="dialog"
            aria-label={meta.docKind ?? t("documentDetails")}
            className="fixed z-50 w-[340px] rounded-md border border-line bg-white p-4 shadow-xl"
            style={{ top: coords.top, left: coords.left }}
          >
            <DocMetaCard
              meta={meta}
              color={color}
              deadlineCoverage={deadlineCoverage}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
