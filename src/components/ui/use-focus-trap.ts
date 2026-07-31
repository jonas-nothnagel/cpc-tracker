"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Keyboard/screen-reader focus management for overlay panels (drawers and
 * dialogs). Factored out of the shared Modal so the coherence-briefing drawers
 * get the same behaviour Modal already has:
 *
 *  - on activate: remember the element that had focus, then move focus into the
 *    panel (its first focusable child, or the panel itself as a fallback);
 *  - while active: trap Tab / Shift+Tab within the panel's focusable elements so
 *    focus never escapes to the frozen page behind the overlay;
 *  - while active: if the panel swaps its mounted content (in-drawer
 *    navigation) and the focused node is removed, re-home focus into the panel
 *    so the trap holds and the reader follows the new content;
 *  - on deactivate (or unmount): restore focus to the element that opened it,
 *    when that element is still in the document.
 *
 * Deliberately scoped to focus only. It does NOT own Escape-to-close or
 * body-scroll-lock: the drawers each carry their own (and their Escape logic
 * differs — some prefer "Back" over "Close"), so this hook composes with those
 * effects rather than duplicating or overriding them.
 *
 * @param active whether the panel is currently open
 * @param options.autoFocus when false, the panel places initial focus itself
 *   and this hook contributes only the Tab cycle, the escape safety net, and
 *   the restore-on-close. DrawerShell uses this so focus lands on the panel
 *   header rather than on whichever control happens to come first.
 * @returns a ref to attach to the panel's root element (the floating panel,
 *   not the scrim)
 */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

// A DOM-present element counts as a tab stop only if it actually renders a box.
// display:none / [hidden] / collapsed elements return no client rects; treating
// one as the first or last stop would break the wrap and leak focus.
function visibleFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((el) => el.getClientRects().length > 0);
}

export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  active: boolean,
  options?: { autoFocus?: boolean },
): RefObject<T | null> {
  const autoFocus = options?.autoFocus ?? true;
  const containerRef = useRef<T>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    previousFocus.current = document.activeElement as HTMLElement | null;

    const focusFirst = () => {
      const container = containerRef.current;
      if (!container) return;
      const focusable = visibleFocusable(container);
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        // No focusable child: focus the panel itself so the reader lands
        // inside the dialog rather than behind it. Make it programmatically
        // focusable if it is not already (invisible, no styling impact).
        if (!container.hasAttribute("tabindex")) {
          container.setAttribute("tabindex", "-1");
        }
        container.focus();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const container = containerRef.current;
      if (!container) return;
      const focusable = visibleFocusable(container);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement;
      // Self-heal: if focus has left the panel — e.g. the drawer swapped its
      // inner content while open and the focused node was removed, dropping
      // focus to <body> — pull it back in rather than letting Tab walk the
      // frozen page behind the aria-modal dialog.
      if (!activeEl || !container.contains(activeEl)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    // Re-home focus when the panel swaps its mounted content while staying open
    // (drawers with in-drawer navigation). Only acts when focus has actually
    // fallen out of the panel, so live content updates that don't touch the
    // focused control never steal focus.
    const observer = new MutationObserver(() => {
      const container = containerRef.current;
      if (!container) return;
      if (!container.contains(document.activeElement)) {
        focusFirst();
      }
    });

    // Move focus into the panel on open (after paint, like modal.tsx), then
    // observe so later content swaps re-home focus too.
    const frame = requestAnimationFrame(() => {
      if (autoFocus) focusFirst();
      const container = containerRef.current;
      if (container) {
        observer.observe(container, { childList: true, subtree: true });
      }
    });

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      observer.disconnect();
      // Only restore focus if the opener is still in the document; calling
      // focus() on a detached node is a no-op that would strand focus on
      // <body> at the top of the page.
      const prev = previousFocus.current;
      if (prev && prev.isConnected) prev.focus();
    };
  }, [active, autoFocus]);

  return containerRef;
}
