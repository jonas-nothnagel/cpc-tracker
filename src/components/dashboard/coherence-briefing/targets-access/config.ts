/**
 * Kill switch for the targets browse bar.
 *
 * Set to `false` and the bar stops rendering. The three pre-existing routes
 * into the targets drawer (wheel legend hover card, the inspect-and-adjust
 * panel, the Doc-in-Focus title popover) are untouched either way, so turning
 * this off returns the page to how it read before — harder to find, but not
 * broken.
 *
 * Its own module so `browse-bar.tsx` can import it without a cycle through the
 * barrel.
 */
export const TARGETS_BROWSE_BAR = true;
