"use client";

import { useState } from "react";
import type { Target, BTRActionType } from "@/types";
import type { TargetRow } from "@/lib/csv-parser";

/**
 * Small badge labeling a BTR row as "Mitigation" or "Adaptation". Shown next to
 * the BTR source label wherever BTR pseudo-targets appear in lists, so users can
 * tell at a glance whether an action is a mitigation measure (CTF Table 5) or
 * an adaptation action (Table III.9). Returns null for policy targets (no badge).
 *
 * Colors: mitigation uses purple (matches BTR document color `#7c3aed`);
 * adaptation uses fuchsia to avoid clashing with NBSAP teal elsewhere in the
 * palette. Text is the contract — color is decorative.
 */
export const BTR_MITIGATION_COLOR = "#7c3aed"; // violet / BTR doc color
export const BTR_ADAPTATION_COLOR = "#c026d3"; // fuchsia-600

export function ActionTypeBadge({ actionType }: { actionType?: BTRActionType }) {
  if (!actionType) return null;
  const isAdaptation = actionType === "adaptation";
  const label = isAdaptation ? "Adaptation" : "Mitigation";
  const title = isAdaptation
    ? "Reported adaptation action (Mongolia BTR1 Table III.9)"
    : "Reported mitigation measure (Mongolia BTR1 CTF-NDC Table 5)";
  const bg = isAdaptation ? "bg-fuchsia-50" : "bg-purple-50";
  const fg = isAdaptation ? "text-fuchsia-700" : "text-purple-700";
  const border = isAdaptation ? "border-fuchsia-200" : "border-purple-200";
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide border ${bg} ${fg} ${border}`}
      title={title}
    >
      {label}
    </span>
  );
}

/**
 * Renders target text with quantitative and time-bound phrases highlighted.
 * Used in modals, tooltips, and lists where targets are displayed.
 */
export function TargetTextWithHighlights({ target }: { target: Target }) {
  const { text, quantitativeDetails, timeBoundDetails } = target;

  if (!quantitativeDetails && !timeBoundDetails) {
    return <span>{text}</span>;
  }

  const quantPhrases = (quantitativeDetails ?? "")
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean);
  const timePhrases = (timeBoundDetails ?? "")
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (quantPhrases.length === 0 && timePhrases.length === 0) {
    return <span>{text}</span>;
  }

  // Build list of (substring, className) to highlight, longest first
  const highlights: { str: string; className: string }[] = [
    ...quantPhrases.map((str) => ({ str, className: "bg-[var(--undp-blue)]/15 font-medium" })),
    ...timePhrases.map((str) => ({ str, className: "bg-amber-100 font-medium" })),
  ].sort((a, b) => b.str.length - a.str.length);

  let remaining = text;
  const parts: React.ReactNode[] = [];
  let key = 0;

  while (remaining.length > 0) {
    let best: { index: number; len: number; className: string } | null = null;
    for (const { str, className } of highlights) {
      if (!str) continue;
      const idx = remaining.indexOf(str);
      if (idx !== -1 && (best === null || idx < best.index)) {
        best = { index: idx, len: str.length, className };
      }
    }

    if (best === null) {
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }

    if (best.index > 0) {
      parts.push(<span key={key++}>{remaining.slice(0, best.index)}</span>);
    }
    parts.push(
      <span key={key++} className={best.className} title="Measurable outcome">
        {remaining.slice(best.index, best.index + best.len)}
      </span>
    );
    remaining = remaining.slice(best.index + best.len);
  }

  return <span>{parts}</span>;
}

/**
 * Collapsible display of activities and actions/measures for a target.
 * Shows nothing if both fields are empty.
 */
export function ActivitiesActions({ target }: { target: Target | TargetRow }) {
  const [open, setOpen] = useState(false);
  const { activities, actions } = target;

  if (!activities && !actions) return null;

  const count = (activities ? 1 : 0) + (actions ? 1 : 0);

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[10px] text-[var(--undp-blue)] hover:underline flex items-center gap-1"
      >
        <span className="inline-block transition-transform" style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>
          &#9654;
        </span>
        Activities &amp; Actions ({count})
      </button>
      {open && (
        <div className="mt-1 space-y-1.5 pl-2 border-l-2 border-[var(--undp-blue)]/20">
          {activities && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)]">
                Activities
              </span>
              <p className="text-[11px] text-[var(--undp-black)] leading-relaxed mt-0.5">
                {activities}
              </p>
            </div>
          )}
          {actions && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)]">
                Actions / Measures
              </span>
              <p className="text-[11px] text-[var(--undp-black)] leading-relaxed mt-0.5">
                {actions}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
