"use client";

/**
 * DrawerShell — the one right-hand overlay panel used by every briefing
 * drill-down, plus DrawerHeader, the sticky bar each panel puts at its top.
 *
 * Before this existed, each drawer hand-rolled the same six things (scrim,
 * dialog element, Escape handling, body-scroll lock, focus trap, close button)
 * and they had drifted: two drawers preferred Back over Close on Escape and two
 * did not, the financing detail drawer had no focus trap at all, and the back
 * row sat at a higher z-index than the header it was supposed to sit above.
 * Panels now supply only their own header content and body.
 *
 * Navigation keys are owned here so they mean the same thing in every panel:
 *
 *   Escape                      back one level, or close at the root
 *   Alt+Left, Cmd+Left          back one level
 *   Backspace                   back one level
 *
 * The three back keys are inert while the caret is in a text field, and all of
 * them stand down for any handler that already claimed the key (see the
 * defaultPrevented note below).
 *
 * Header and body stay together inside each panel component rather than being
 * passed up as separate slots, because most headers are built from the same
 * memoised derivations as their body. DrawerHeader reads the chrome it needs
 * (back target, close, the focus anchor) from context instead.
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { useTranslations } from "next-intl";
import { isEditableTarget } from "@/lib/keyboard";
import { DrawerBackButton } from "./drawer-back-button";
import { useFocusTrap } from "./use-focus-trap";

interface DrawerChrome {
  onClose: () => void;
  onBack?: () => void;
  backLabel?: string;
  headerRef: RefObject<HTMLDivElement | null>;
}

const DrawerChromeContext = createContext<DrawerChrome | null>(null);

export interface DrawerShellProps {
  open: boolean;
  onClose: () => void;
  /** Supplied only when there is somewhere to go back to. Its presence turns on
   *  the back row and makes Escape step back instead of closing. */
  onBack?: () => void;
  /** Contextual back label, e.g. "Back to NDC ↔ NBSAP". Falls back to "Back". */
  backLabel?: string;
  /** aria-label for the dialog itself, e.g. "Sector view: Agriculture". */
  dialogLabel: string;
  /** aria-label for the scrim, e.g. "Close sector view". Defaults to "Close". */
  closeLabel?: string;
  /** Identity of the panel currently shown. When it changes, focus moves to the
   *  header so the change is announced, and the body scroll resets, except when
   *  returning to a panel visited earlier in this trail, which is restored to
   *  where it was left. */
  panelKey?: string;
  children: ReactNode;
}

export function DrawerShell({
  open,
  onClose,
  onBack,
  backLabel,
  dialogLabel,
  closeLabel,
  panelKey,
  children,
}: DrawerShellProps) {
  const t = useTranslations("common");
  // The shell places focus itself (on the header, not on whichever control
  // happens to come first), so the trap contributes the Tab cycle, the
  // focus-escape safety net, and the restore-on-close only.
  const panelRef = useFocusTrap<HTMLElement>(open, { autoFocus: false });
  const headerRef = useRef<HTMLDivElement>(null);
  // Where each panel in this trail was left, so stepping back returns the
  // reader to the row they drilled from rather than the top of a long list.
  const scrollByPanel = useRef(new Map<string, number>());
  const shownPanel = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // TourOverlay binds on `document` and calls preventDefault on the keys it
      // owns. Document-level listeners run before window-level ones in the
      // bubble phase, so checking this keeps the two decoupled without either
      // importing the other. Nested popovers use the same handshake.
      if (e.defaultPrevented) return;
      const editable = isEditableTarget(e.target);

      if (e.key === "Escape") {
        e.preventDefault();
        if (onBack) onBack();
        else onClose();
        return;
      }
      if (!onBack) return;

      // Cmd+Left is "start of line" in a text field; Alt+Left is not, so only
      // the Cmd form needs the guard.
      if (e.key === "ArrowLeft" && (e.altKey || (e.metaKey && !editable))) {
        e.preventDefault();
        onBack();
        return;
      }
      if (
        e.key === "Backspace" &&
        !editable &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        e.preventDefault();
        onBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onBack, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      scrollByPanel.current.clear();
      shownPanel.current = undefined;
      return;
    }
    const panel = panelRef.current;
    const outgoing = shownPanel.current;
    if (panel && outgoing !== undefined && outgoing !== panelKey) {
      scrollByPanel.current.set(outgoing, panel.scrollTop);
    }
    shownPanel.current = panelKey;
    if (panel) {
      panel.scrollTop =
        panelKey === undefined
          ? 0
          : (scrollByPanel.current.get(panelKey) ?? 0);
    }
    // After paint, matching the focus trap's own timing, so the header exists
    // and is laid out before focus lands on it. preventScroll keeps the
    // restored offset: focusing normally would yank the panel back to the top.
    const frame = requestAnimationFrame(() =>
      headerRef.current?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, [open, panelKey, panelRef]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label={closeLabel ?? t("close")}
        onClick={onClose}
        className="absolute inset-0 bg-[var(--undp-black)]/40 backdrop-blur-sm"
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={dialogLabel}
        className="relative h-full w-full sm:w-[560px] md:w-[640px] shadow-2xl overflow-y-auto"
        style={{ backgroundColor: "#ffffff" }}
      >
        <DrawerChromeContext.Provider
          value={{ onClose, onBack, backLabel, headerRef }}
        >
          {children}
        </DrawerChromeContext.Provider>
      </aside>
    </div>
  );
}

/**
 * The sticky bar at the top of a panel: the back row when there is one, the
 * panel's own eyebrow and title, the close button, and any controls that must
 * stay put while the body scrolls.
 *
 * `children` is the title block only. The close button and the back row belong
 * to the shell, so a panel can never accidentally ship without one or place it
 * somewhere unexpected.
 */
export function DrawerHeader({
  children,
  toolbar,
}: {
  children: ReactNode;
  /** Controls that stay visible while the body scrolls, such as the target
   *  browser's search field and filter chips. */
  toolbar?: ReactNode;
}) {
  const t = useTranslations("common");
  const chrome = useContext(DrawerChromeContext);
  if (!chrome) {
    throw new Error("DrawerHeader must be rendered inside a DrawerShell");
  }
  const { onClose, onBack, backLabel, headerRef } = chrome;
  return (
    <div className="sticky top-0 z-10 border-b border-line bg-white/90 backdrop-blur">
      {onBack && <DrawerBackButton onBack={onBack} label={backLabel} />}
      <div className="px-6 py-4 flex items-start justify-between gap-4">
        {/* Focused programmatically on every panel change so the reader
            announces the new context. Not a tab stop. */}
        <div ref={headerRef} tabIndex={-1} className="min-w-0 outline-none">
          {children}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="text-[var(--undp-gray)] hover:text-[var(--undp-black)] text-2xl leading-none shrink-0"
        >
          ×
        </button>
      </div>
      {toolbar && <div className="px-6 pb-4">{toolbar}</div>}
    </div>
  );
}
