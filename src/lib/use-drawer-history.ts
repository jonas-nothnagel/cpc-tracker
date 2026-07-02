"use client";

import { useCallback, useState } from "react";

/**
 * useDrawerHistory — back-navigable subject stack for any drawer/modal that
 * can drill deeper into related items.
 *
 * `rootSubject` is the parent-controlled "open this" instruction. When the
 * parent feeds in a different identity (a fresh open, or a page-level click
 * that swaps the drawer's subject), the hook resets the stack to that new
 * root. `push()` lets the drawer drill into a child subject without closing;
 * `back()` pops one level. `current` is the visible subject (root or top of
 * stack). `previous` is the level back wakes up at — useful for rendering a
 * contextual label like "Back to {parent}".
 *
 * Adopted by FlagProfileDrawer (Recurring Targets drill) and PairDrawer
 * (target-pair inside doc-pair). The PairDrawer used to carry this logic
 * inline; this hook is the lifted, reusable version.
 */
export interface DrawerHistory<T> {
  current: T | null;
  previous: T | null;
  canGoBack: boolean;
  push: (subject: T) => void;
  back: () => void;
}

export function useDrawerHistory<T>(rootSubject: T | null): DrawerHistory<T> {
  const [stack, setStack] = useState<T[]>(() =>
    rootSubject !== null ? [rootSubject] : [],
  );
  // React's "reset state when a prop changes" idiom: snapshot the previous
  // root and compare during render. Avoids the extra render cycle a
  // useEffect-based reset would cause and mirrors the pattern PairDrawer
  // already uses inline.
  const [seenRoot, setSeenRoot] = useState<T | null>(rootSubject);
  if (seenRoot !== rootSubject) {
    setSeenRoot(rootSubject);
    setStack(rootSubject !== null ? [rootSubject] : []);
  }

  const push = useCallback((subject: T) => {
    setStack((prev) => [...prev, subject]);
  }, []);

  const back = useCallback(() => {
    setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  const len = stack.length;
  return {
    current: len > 0 ? stack[len - 1] : null,
    previous: len > 1 ? stack[len - 2] : null,
    canGoBack: len > 1,
    push,
    back,
  };
}
