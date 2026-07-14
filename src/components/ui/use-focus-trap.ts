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
 *  - on deactivate (or unmount): restore focus to the element that opened it.
 *
 * Deliberately scoped to focus only. It does NOT own Escape-to-close or
 * body-scroll-lock: the drawers each carry their own (and their Escape logic
 * differs — some prefer "Back" over "Close"), so this hook composes with those
 * effects rather than duplicating or overriding them.
 *
 * Mirrors the focusable selector and first-focus/restore sequence in
 * `modal.tsx`; Modal itself is left as-is (its Escape + scroll-lock are
 * intertwined in one effect and it is the working reference).
 *
 * @param active whether the panel is currently open
 * @returns a ref to attach to the panel's root element (the floating panel,
 *   not the scrim)
 */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  active: boolean,
): RefObject<T | null> {
  const containerRef = useRef<T>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    previousFocus.current = document.activeElement as HTMLElement | null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const container = containerRef.current;
      if (!container) return;
      const focusable =
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
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
    };

    document.addEventListener("keydown", handleKeyDown);
    // Move focus into the panel on open (after paint, like modal.tsx).
    requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;
      const firstFocusable =
        container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (firstFocusable) {
        firstFocusable.focus();
      } else {
        // No focusable child: focus the panel itself so the reader lands
        // inside the dialog rather than behind it. Make it programmatically
        // focusable if it is not already (invisible, no styling impact).
        if (!container.hasAttribute("tabindex")) {
          container.setAttribute("tabindex", "-1");
        }
        container.focus();
      }
    });

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus.current?.focus();
    };
  }, [active]);

  return containerRef;
}
