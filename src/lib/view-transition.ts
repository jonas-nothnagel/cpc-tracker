/**
 * Run a state update inside a browser view transition, so elements that carry
 * a `view-transition-name` glide from their old place to their new one (and
 * everything else crossfades) instead of jumping.
 *
 * Progressive enhancement: where the API is missing (older browsers, jsdom)
 * or the reader prefers reduced motion, the update simply runs. React state
 * set inside the callback is flushed synchronously so the browser snapshots
 * the finished DOM.
 */
import { flushSync } from "react-dom";

type WithStartViewTransition = Document & {
  startViewTransition?: (update: () => void) => unknown;
};

export function withViewTransition(update: () => void): void {
  const doc = typeof document === "undefined" ? null : (document as WithStartViewTransition);
  const reduced =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;
  // A hidden document skips the transition by spec (and logs an abort);
  // run the update plainly instead.
  if (!doc?.startViewTransition || reduced || doc.visibilityState === "hidden") {
    update();
    return;
  }
  doc.startViewTransition(() => flushSync(update));
}

/** A `view-transition-name` must be a CSS custom-ident: letters, digits,
 *  hyphens and underscores only (indicator ids such as "D.2" are not). */
export function transitionName(...parts: string[]): string {
  return parts.join("-").replace(/[^A-Za-z0-9_-]+/g, "-");
}
