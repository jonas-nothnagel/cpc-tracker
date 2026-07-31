"use client";

import { useCallback, useMemo, useState } from "react";
import {
  openPanel,
  popPanel,
  pushPanel,
  type BriefingPanel,
} from "./panel-stack";

export interface BriefingPanels {
  /** The panel on screen, or null when nothing is open. */
  current: BriefingPanel | null;
  /** Where back leads, used to label the back row. */
  previous: BriefingPanel | null;
  /** How deep the reader has drilled. 0 when nothing is open. */
  depth: number;
  canGoBack: boolean;
  /** Open from the page: starts a fresh trail. */
  open: (panel: BriefingPanel) => void;
  /** Drill deeper from inside a panel: keeps the trail. */
  push: (panel: BriefingPanel) => void;
  back: () => void;
  close: () => void;
}

/**
 * Owns the briefing's panel trail. Deliberately not a context: the briefing
 * keeps all of its state in one component and threads callbacks down, and one
 * more hook there is easier to follow than a provider wrapping the whole tree.
 */
export function useBriefingPanels(): BriefingPanels {
  const [stack, setStack] = useState<BriefingPanel[]>([]);

  const open = useCallback(
    (panel: BriefingPanel) => setStack(openPanel(panel)),
    [],
  );
  const push = useCallback(
    (panel: BriefingPanel) =>
      setStack((prev) =>
        // A push with nothing open is an open: some drill-downs are reachable
        // both from a panel and straight from the page.
        prev.length === 0 ? openPanel(panel) : pushPanel(prev, panel),
      ),
    [],
  );
  const back = useCallback(() => setStack(popPanel), []);
  const close = useCallback(() => setStack([]), []);

  return useMemo(
    () => ({
      current: stack.length > 0 ? stack[stack.length - 1] : null,
      previous: stack.length > 1 ? stack[stack.length - 2] : null,
      depth: stack.length,
      canGoBack: stack.length > 1,
      open,
      push,
      back,
      close,
    }),
    [stack, open, push, back, close],
  );
}
