/**
 * Pure geometry helpers for the guided-tour spotlight overlay.
 * Kept free of DOM access so they can be unit-tested directly.
 */

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export type Placement = "top" | "bottom" | "left" | "right";

export interface TooltipPosition {
  top: number;
  left: number;
  placement: Placement;
}

/** Gap between the spotlight edge and the tooltip card. */
const TOOLTIP_GAP = 12;
/** Minimum distance the tooltip keeps from the viewport edges. */
const VIEWPORT_MARGIN = 12;

/** Expand the target's bounding rect by `padding` on every side. */
export function cutoutRect(target: Rect, padding: number): Rect {
  return {
    top: target.top - padding,
    left: target.left - padding,
    width: target.width + padding * 2,
    height: target.height + padding * 2,
  };
}

function clamp(value: number, min: number, max: number): number {
  // When the tooltip is larger than the available span, pin to the margin.
  return Math.max(min, Math.min(value, Math.max(min, max)));
}

/**
 * Position the tooltip card next to the spotlight rect.
 * Tries the preferred side first (default "bottom"), flips to the opposite
 * side when there is not enough room, then falls back to whichever side has
 * the most space. The result is clamped so the card stays inside the
 * viewport.
 */
export function placeTooltip(
  spotlight: Rect,
  tooltip: Size,
  viewport: Size,
  preferred: Placement = "bottom",
): TooltipPosition {
  const room: Record<Placement, number> = {
    top: spotlight.top,
    bottom: viewport.height - (spotlight.top + spotlight.height),
    left: spotlight.left,
    right: viewport.width - (spotlight.left + spotlight.width),
  };
  const needs: Record<Placement, number> = {
    top: tooltip.height + TOOLTIP_GAP + VIEWPORT_MARGIN,
    bottom: tooltip.height + TOOLTIP_GAP + VIEWPORT_MARGIN,
    left: tooltip.width + TOOLTIP_GAP + VIEWPORT_MARGIN,
    right: tooltip.width + TOOLTIP_GAP + VIEWPORT_MARGIN,
  };

  const opposite: Record<Placement, Placement> = {
    top: "bottom",
    bottom: "top",
    left: "right",
    right: "left",
  };

  let placement: Placement;
  if (room[preferred] >= needs[preferred]) {
    placement = preferred;
  } else if (room[opposite[preferred]] >= needs[opposite[preferred]]) {
    placement = opposite[preferred];
  } else {
    placement = (Object.keys(room) as Placement[]).reduce((best, side) =>
      room[side] > room[best] ? side : best,
    );
  }

  let top: number;
  let left: number;
  if (placement === "top" || placement === "bottom") {
    top =
      placement === "bottom"
        ? spotlight.top + spotlight.height + TOOLTIP_GAP
        : spotlight.top - tooltip.height - TOOLTIP_GAP;
    left = spotlight.left + spotlight.width / 2 - tooltip.width / 2;
  } else {
    left =
      placement === "right"
        ? spotlight.left + spotlight.width + TOOLTIP_GAP
        : spotlight.left - tooltip.width - TOOLTIP_GAP;
    top = spotlight.top + spotlight.height / 2 - tooltip.height / 2;
  }

  return {
    top: clamp(top, VIEWPORT_MARGIN, viewport.height - tooltip.height - VIEWPORT_MARGIN),
    left: clamp(left, VIEWPORT_MARGIN, viewport.width - tooltip.width - VIEWPORT_MARGIN),
    placement,
  };
}
