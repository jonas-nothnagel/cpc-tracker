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

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  getDocColor,
  getDocFullLabel,
  getDocMeta,
  type DocMeta,
} from "@/lib/utils";
import { getDocClass, type DocClass } from "@/lib/doc-taxonomy";
import type { CountryConfig, PolicyDocumentType } from "@/types";

const HEADLINE_SERIF = "var(--font-display)";

/**
 * The class chip and the sourced `docKind` describe the same thing at different
 * resolutions: the chip is the normalised, comparable label, `docKind` is the
 * document's own wording. Where the two say the same thing ("Government
 * strategic plan" under a "GOVERNMENT STRATEGIC PLAN" chip) showing both reads
 * as a stutter, so the prose is dropped and the chip stands alone. Where the
 * prose carries more (PENCYT's "National strategic plan (science, technology
 * and innovation)") both are kept: the chip for comparison, the prose for the
 * specifics, which is the sourced value we must not lose.
 */
function saysMoreThanClass(docKind: string, classLabel: string): boolean {
  const normalise = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return normalise(docKind) !== normalise(classLabel);
}

export function DocMetaCard({
  meta,
  color,
  fullTitle,
  docClass,
  deadlineCoverage,
  hideDot = false,
  footer,
}: {
  meta: DocMeta;
  /** The document's identity colour, used for the leading dot + deadline sliver. */
  color: string;
  /** Shown only in the hover card, where the title isn't already on screen. */
  fullTitle?: string;
  /** Normalised instrument kind from `@/lib/doc-taxonomy`. Rendered as a chip
   *  above the sourced `docKind` prose: the chip is comparable across documents
   *  (which is what lets a reader rank them), the prose carries the specifics.
   *  Omit and the card renders exactly as it did before the taxonomy existed. */
  docClass?: DocClass;
  /** When provided and non-empty, shows the time-bound coverage sliver + count. */
  deadlineCoverage?: { total: number; timeBound: number };
  /** Hide the leading colour dot when the context already shows it (overview rows). */
  hideDot?: boolean;
  /** An extra action beside "View document", e.g. a way into the document's
   *  targets. A slot rather than a set of props so this component stays
   *  presentational and each surface decides whether it can host an action and
   *  how that action should behave once used. */
  footer?: ReactNode;
}) {
  const t = useTranslations("briefing.docFocus");
  const tLabels = useTranslations("labels");
  const factLine = [meta.published, meta.author].filter(Boolean).join(" · ");
  const classLabel = docClass
    ? tLabels(`docClass.${docClass}` as "docClass.commitment")
    : null;
  const showDocKind = Boolean(
    meta.docKind && (!classLabel || saysMoreThanClass(meta.docKind, classLabel)),
  );
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
      {(meta.docKind || docClass) && (
        <p className="flex items-start gap-1.5 text-caption font-medium text-[var(--undp-black)] leading-snug">
          {!hideDot && (
            <span
              aria-hidden="true"
              className="mt-[5px] inline-block h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: color }}
            />
          )}
          <span>
            {docClass && (
              <span
                className="mr-1.5 inline-block rounded border border-line-strong px-1.5 py-px text-[11px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] align-[2px]"
                title={tLabels("docTierHint")}
              >
                {classLabel}
              </span>
            )}
            {showDocKind && meta.docKind}
          </span>
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
      {(meta.url || footer) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
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
          {footer}
        </div>
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
 *
 * The card is portaled to the end of the body, which keeps it clear of the
 * legend's layout but puts it last in tab order. Tab from the trigger is
 * therefore redirected into the card, and Tab or Shift+Tab back out of it
 * returns to the trigger, so the link and the targets action inside are
 * reachable without a mouse instead of sitting behind every other control on
 * the page.
 */
export function DocHoverCard({
  doc,
  countryConfig,
  footer,
  children,
}: {
  doc: PolicyDocumentType;
  countryConfig: CountryConfig | null;
  /** An extra action inside the card, e.g. a way into the document's targets. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const meta = getDocMeta(countryConfig, doc);
  const hasMeta = Boolean(
    meta.docKind ||
      meta.published ||
      meta.author ||
      meta.objective ||
      meta.url ||
      footer,
  );
  const ref = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
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
  const focusTrigger = () => {
    ref.current?.querySelector("button")?.focus();
  };
  /** Order matters: moving focus first lets the resulting focus event reopen the
   *  card, and the close below then wins the same batch. Closing first would
   *  leave the reopen as the last write, so the card could never be dismissed
   *  from the keyboard. */
  const dismiss = () => {
    focusTrigger();
    setCoords(null);
  };
  /** React routes portal events through the component tree, so this handler sees
   *  keys pressed both on the trigger and inside the card. */
  const handleKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "Escape") {
      dismiss();
      return;
    }
    if (e.key !== "Tab" || !coords) return;
    const stops = Array.from(
      cardRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      ) ?? [],
    );
    if (stops.length === 0) return;
    const insideCard = cardRef.current?.contains(e.target as Node) ?? false;
    if (!insideCard) {
      if (e.shiftKey) return;
      e.preventDefault();
      stops[0].focus();
      return;
    }
    const index = stops.indexOf(document.activeElement as HTMLElement);
    const leaving = e.shiftKey ? index <= 0 : index === stops.length - 1;
    if (leaving) {
      e.preventDefault();
      dismiss();
    }
  };
  return (
    <span
      ref={ref}
      className="inline-flex"
      onMouseEnter={open}
      onMouseLeave={scheduleClose}
      onFocus={open}
      onBlur={scheduleClose}
      onKeyDown={handleKeyDown}
    >
      {children}
      {coords &&
        typeof document !== "undefined" &&
        createPortal(
          // Deliberately not role="tooltip": the card holds a link and, on the
          // wheel legend, a targets action, and a tooltip may not contain
          // interactive content.
          <div
            ref={cardRef}
            aria-label={fullTitle}
            onMouseEnter={() => {
              if (closeTimer.current) clearTimeout(closeTimer.current);
            }}
            onMouseLeave={scheduleClose}
            className="fixed z-50 w-[300px] rounded-md border border-line bg-white p-3.5 shadow-xl"
            style={{ top: coords.top, left: coords.left }}
          >
            <DocMetaCard
              meta={meta}
              color={color}
              fullTitle={fullTitle}
              docClass={getDocClass(countryConfig, doc)}
              footer={
                footer && (
                  <span onClick={() => setCoords(null)}>{footer}</span>
                )
              }
            />
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
  docClass,
  deadlineCoverage,
  footer,
  children,
}: {
  meta: DocMeta;
  color: string;
  /** Passed through to the card. Optional, like every taxonomy field. */
  docClass?: DocClass;
  deadlineCoverage?: { total: number; timeBound: number };
  /** An extra action inside the card. Legitimate here, unlike in the hover
   *  card, because this popover opens on click and stays until dismissed. */
  footer?: ReactNode;
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
              docClass={docClass}
              deadlineCoverage={deadlineCoverage}
              footer={
                footer && (
                  // The footer action opens a panel over this popover, which
                  // would otherwise still be sitting here when the panel
                  // closes. The click bubbles after the action's own handler.
                  <span onClick={() => setCoords(null)}>{footer}</span>
                )
              }
            />
          </div>,
          document.body,
        )}
    </>
  );
}
